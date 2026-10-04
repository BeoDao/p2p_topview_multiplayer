import type { AnnualFiling, CycleState } from '../types';
import { clamp } from '../lib/format';
import { CYCLE_POSITION_SCORE, type CycleClassification } from './cycleClassifier';
import type { NormalizedEarnings } from './normalizedEarnings';

export type FactorKey = 'valuation' | 'health' | 'leverage' | 'catalyst' | 'cycle';

export const FACTOR_LABELS: Record<FactorKey, string> = {
  valuation: 'Valuation',
  health: 'Financial Health',
  leverage: 'Operating Leverage',
  catalyst: 'Catalyst / Supply',
  cycle: 'Cycle Position',
};

export type FactorWeights = Record<FactorKey, number>;

export const DEFAULT_WEIGHTS: FactorWeights = { valuation: 0.3, health: 0.2, leverage: 0.15, catalyst: 0.15, cycle: 0.2 };

export interface HealthDetail {
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  cashToAssets: number;
  altmanZ: number | null;
  zone: 'Safe' | 'Grey' | 'Distress' | 'N/A';
}

export interface LeverageDetail {
  fixedCostIntensity: number;
  marginGap: number | null;
  /** Median historical degree of operating leverage (%ΔEBIT / %ΔRevenue), bounded to ±10. */
  dol: number | null;
  /** EBIT uplift if margin reverts to normalized at current revenue. */
  ebitUpliftToNormal: number | null;
  scenarios: { revenueChange: number; ebitChange: number | null }[];
}

export interface CatalystDetail {
  capexToDa: number | null;
  capexChange: number | null;
  inventoryToSalesChange: number | null;
  driverQoq: number | null;
}

export interface ScoreCard {
  factors: Record<FactorKey, number>;
  composite: number;
  health: HealthDetail;
  leverage: LeverageDetail;
  catalyst: CatalystDetail;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function altmanZ(f: AnnualFiling, marketCap: number | null): number | null {
  if (f.totalAssets <= 0 || marketCap == null) return null;
  const totalLiabilities = f.totalAssets - f.totalEquity;
  if (totalLiabilities <= 0) return null;
  const ta = f.totalAssets;
  return (
    1.2 * ((f.currentAssets - f.currentLiabilities) / ta) +
    1.4 * (f.retainedEarnings / ta) +
    3.3 * (f.operatingIncome / ta) +
    0.6 * (marketCap / totalLiabilities) +
    1.0 * (f.revenue / ta)
  );
}

function healthDetail(f: AnnualFiling, marketCap: number | null): HealthDetail {
  const ebitda = f.operatingIncome + f.da;
  const netDebt = f.totalDebt - f.cash;
  const z = altmanZ(f, marketCap);
  return {
    netDebtToEbitda: ebitda > 0 ? netDebt / ebitda : null,
    interestCoverage: f.interestExpense > 0 ? f.operatingIncome / f.interestExpense : null,
    cashToAssets: f.totalAssets > 0 ? f.cash / f.totalAssets : 0,
    altmanZ: z,
    zone: z == null ? 'N/A' : z >= 2.99 ? 'Safe' : z >= 1.81 ? 'Grey' : 'Distress',
  };
}

function healthScore(f: AnnualFiling, h: HealthDetail): number {
  const netDebt = f.totalDebt - f.cash;
  const nd = netDebt <= 0 ? 100 : h.netDebtToEbitda == null ? 0 : clamp(100 - h.netDebtToEbitda * 25);
  const ic = f.interestExpense <= 0 ? 100 : h.interestCoverage == null ? 0 : clamp(((h.interestCoverage - 1) / 11) * 100);
  const cash = clamp(h.cashToAssets * 400);
  const z = h.altmanZ == null ? 50 : clamp(((h.altmanZ - 1.1) / 1.9) * 100);
  return (nd + ic + cash + z) / 4;
}

function leverageDetail(filings: AnnualFiling[], ne: NormalizedEarnings): LeverageDetail {
  const latest = filings[filings.length - 1];
  const dols: number[] = [];
  for (let i = 1; i < filings.length; i++) {
    const a = filings[i - 1];
    const b = filings[i];
    const dRev = a.revenue > 0 ? b.revenue / a.revenue - 1 : 0;
    const dEbit = a.operatingIncome !== 0 ? (b.operatingIncome - a.operatingIncome) / Math.abs(a.operatingIncome) : 0;
    if (Math.abs(dRev) > 0.03) dols.push(Math.max(-10, Math.min(10, dEbit / dRev)));
  }
  const dol = median(dols.slice(-8));
  const curEbit = latest.operatingIncome;
  const normEbit = ne.normalizedMargin != null ? ne.normalizedMargin * latest.revenue : null;
  return {
    fixedCostIntensity: latest.revenue > 0 ? latest.da / latest.revenue : 0,
    marginGap: ne.normalizedMargin != null && ne.currentMargin != null ? ne.normalizedMargin - ne.currentMargin : null,
    dol,
    ebitUpliftToNormal: normEbit != null && curEbit !== 0 ? (normEbit - curEbit) / Math.abs(curEbit) : null,
    scenarios: [-0.1, 0.1, 0.2, 0.3].map((r) => ({ revenueChange: r, ebitChange: dol != null ? dol * r : null })),
  };
}

function leverageScore(d: LeverageDetail): number {
  const fixed = clamp(d.fixedCostIntensity * 400);
  const gap = d.marginGap == null ? 50 : clamp(50 + d.marginGap * 500);
  return 0.4 * fixed + 0.6 * gap;
}

function catalystDetail(filings: AnnualFiling[], cycle: CycleClassification): CatalystDetail {
  const latest = filings[filings.length - 1];
  const prev = filings[filings.length - 2];
  return {
    capexToDa: latest.da > 0 ? latest.capex / latest.da : null,
    capexChange: prev && prev.capex > 0 ? latest.capex / prev.capex - 1 : null,
    inventoryToSalesChange: cycle.inventoryToSalesChange,
    driverQoq: cycle.driver?.qoq ?? null,
  };
}

function catalystScore(d: CatalystDetail): number {
  const capex = d.capexToDa == null ? 50 : clamp(100 - (d.capexToDa - 0.6) * 100);
  const capexTrend = d.capexChange == null ? 50 : clamp(50 - d.capexChange * 150);
  const inv = d.inventoryToSalesChange == null ? 50 : clamp(50 - d.inventoryToSalesChange * 300);
  const drv = d.driverQoq == null ? 50 : clamp(50 + d.driverQoq * 300);
  return (capex + capexTrend + inv + drv) / 4;
}

/** Valuation: 60% absolute normalized P/E (6x→100, 30x→0), 40% own-history percentile (cheaper → higher). */
export function valuationScore(normalizedPe: number | null, history: number[]): number {
  if (normalizedPe == null) return 0;
  const abs = clamp(((30 - normalizedPe) / 24) * 100);
  if (history.length < 4) return abs;
  const cheaper = history.filter((h) => h > normalizedPe).length / history.length;
  return 0.6 * abs + 0.4 * cheaper * 100;
}

export function scoreCompany(params: {
  filings: AnnualFiling[];
  ne: NormalizedEarnings;
  cycle: CycleClassification;
  state: CycleState;
  marketCap: number | null;
  normPeHistory: number[];
  weights: FactorWeights;
}): ScoreCard {
  const { filings, ne, cycle, marketCap, normPeHistory, weights } = params;
  const latest = filings[filings.length - 1];
  const health = healthDetail(latest, marketCap);
  const leverage = leverageDetail(filings, ne);
  const catalyst = catalystDetail(filings, cycle);
  const factors: Record<FactorKey, number> = {
    valuation: valuationScore(ne.normalizedPe, normPeHistory),
    health: healthScore(latest, health),
    leverage: leverageScore(leverage),
    catalyst: catalystScore(catalyst),
    cycle: CYCLE_POSITION_SCORE[params.state],
  };
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const composite = (Object.keys(factors) as FactorKey[]).reduce((s, k) => s + factors[k] * weights[k], 0) / wSum;
  return { factors, composite, health, leverage, catalyst };
}
