import type { AnnualFiling, CycleState, IndicatorKey } from '../types';
import { INDICATORS, INDICATOR_SPECS } from '../data/marketIndicators';

export const CYCLE_STATES: CycleState[] = [
  'Structural Growth',
  'Early Downturn',
  'Late Downturn',
  'Bottoming',
  'Early Recovery',
  'Mid Recovery',
  'Late Cycle',
  'Peak',
];

/** Bottom-proximity score used by the composite "cycle position" factor (100 = best entry). */
export const CYCLE_POSITION_SCORE: Record<CycleState, number> = {
  Bottoming: 100,
  'Early Recovery': 85,
  'Late Downturn': 70,
  'Mid Recovery': 55,
  'Structural Growth': 50,
  'Early Downturn': 30,
  'Late Cycle': 20,
  Peak: 0,
};

export interface DriverReading {
  key: IndicatorKey;
  label: string;
  unit: string;
  date: string;
  value: number;
  /** Percentile of the current reading inside its trailing 5-year (20-quarter) window, 0–1. */
  pct5y: number;
  yoy: number | null;
  qoq: number | null;
}

export interface CycleClassification {
  state: CycleState;
  evidence: string[];
  marginPct: number | null;
  marginTrend: number | null;
  revenueCagr3y: number | null;
  revenueGrowth: number | null;
  inventoryToSalesChange: number | null;
  driver: DriverReading | null;
}

const rel = (cur: number, prev: number | undefined): number | null =>
  prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev);

/** Driver reading using only observations dated on or before `asOf` (market data is public at quarter end). */
export function readDriver(key: IndicatorKey, asOf: string): DriverReading | null {
  const series = INDICATORS[key];
  const dates = Object.keys(series).filter((d) => d <= asOf).sort();
  if (dates.length === 0) return null;
  const vals = dates.map((d) => series[d]);
  const cur = vals[vals.length - 1];
  const window = vals.slice(-20);
  const below = window.filter((v) => v < cur).length;
  const equal = window.filter((v) => v === cur).length;
  return {
    key,
    label: INDICATOR_SPECS[key].label,
    unit: INDICATOR_SPECS[key].unit,
    date: dates[dates.length - 1],
    value: cur,
    pct5y: window.length > 1 ? (below + 0.5 * (equal - 1)) / (window.length - 1) : 0.5,
    yoy: rel(cur, vals[vals.length - 5]),
    qoq: rel(cur, vals[vals.length - 2]),
  };
}

const opMargin = (f: AnnualFiling) => (f.revenue > 0 ? f.operatingIncome / f.revenue : 0);

/**
 * Eight-state cyclical classifier. Combines the company's own (PIT-known) margin position and trend with the
 * real-economy driver for its industry (commodity price, freight index, semiconductor index, …).
 */
export function classifyCycle(filings: AnnualFiling[], driverKey: IndicatorKey, asOf: string): CycleClassification {
  const driver = readDriver(driverKey, asOf);
  const evidence: string[] = [];
  const latest = filings.at(-1);
  const prev = filings.at(-2);

  const margins = filings.slice(-10).map(opMargin);
  const curM = latest ? opMargin(latest) : null;
  const marginPct =
    curM != null && margins.length >= 3
      ? margins.filter((m) => m < curM).length / Math.max(1, margins.length - 1)
      : null;
  const marginTrend = latest && prev ? opMargin(latest) - opMargin(prev) : null;
  const threeBack = filings.at(-4);
  const revenueCagr3y =
    latest && threeBack && threeBack.revenue > 0 && latest.revenue > 0
      ? Math.pow(latest.revenue / threeBack.revenue, 1 / 3) - 1
      : null;
  const revenueGrowth = latest && prev && prev.revenue > 0 ? latest.revenue / prev.revenue - 1 : null;
  const inventoryToSalesChange =
    latest && prev && latest.revenue > 0 && prev.revenue > 0
      ? latest.inventory / latest.revenue - prev.inventory / prev.revenue
      : null;

  if (curM != null) evidence.push(`Op. margin ${(curM * 100).toFixed(1)}%${marginPct != null ? ` (P${Math.round(marginPct * 100)} of ${margins.length}y)` : ''}`);
  if (marginTrend != null) evidence.push(`Margin trend ${marginTrend >= 0 ? '+' : ''}${(marginTrend * 100).toFixed(1)}pp YoY`);
  if (revenueCagr3y != null) evidence.push(`Revenue 3y CAGR ${(revenueCagr3y * 100).toFixed(1)}%`);
  if (inventoryToSalesChange != null) evidence.push(`Inventory/sales ${inventoryToSalesChange >= 0 ? '+' : ''}${(inventoryToSalesChange * 100).toFixed(1)}pp`);
  if (driver) {
    evidence.push(
      `${driver.label} ${driver.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} (P${Math.round(driver.pct5y * 100)} 5y` +
        `${driver.yoy != null ? `, ${driver.yoy >= 0 ? '+' : ''}${(driver.yoy * 100).toFixed(0)}% YoY` : ''}` +
        `${driver.qoq != null ? `, ${driver.qoq >= 0 ? '+' : ''}${(driver.qoq * 100).toFixed(0)}% QoQ` : ''})`,
    );
  }

  const mp = marginPct ?? 0.5;
  const mt = marginTrend ?? 0;
  const dp = driver?.pct5y ?? 0.5;
  const dy = driver?.yoy ?? 0;
  const dq = driver?.qoq ?? 0;

  let state: CycleState;
  if (revenueCagr3y != null && revenueCagr3y > 0.25 && (revenueGrowth ?? 0) > 0.15 && mt >= 0 && mp >= 0.5) {
    state = 'Structural Growth';
  } else if ((mp >= 0.8 && dp >= 0.75 && dq < 0) || (mp >= 0.9 && dy < 0)) {
    state = 'Peak';
  } else if (mp >= 0.6 && dp >= 0.6 && dq < 0.03) {
    state = 'Late Cycle';
  } else if (mp >= 0.5 && dy < -0.05) {
    state = 'Early Downturn';
  } else if (mp <= 0.35 && dp <= 0.4 && dq >= 0) {
    state = 'Bottoming';
  } else if (mp < 0.5 && (dy < 0 || mt < 0)) {
    state = 'Late Downturn';
  } else if (mp < 0.5) {
    state = 'Early Recovery';
  } else {
    state = 'Mid Recovery';
  }

  return { state, evidence, marginPct, marginTrend, revenueCagr3y, revenueGrowth, inventoryToSalesChange, driver };
}
