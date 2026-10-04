import type { AnnualFiling, Country, Currency, IndustryBenchmark, MoneyUnit } from '../types';
import { NORMALIZED_TAX_RATE } from '../data/industryBenchmarks';
import { convert, perShare } from './pointInTime';

export type MethodKey = 'A' | 'B' | 'C' | 'D';

export interface MethodResult {
  key: MethodKey;
  label: string;
  /** Normalized EPS in the PRICE currency; null when not computable or the method implies a loss. */
  eps: number | null;
  /** Normalized operating margin implied by the method. */
  margin: number | null;
  detail: string;
}

export type ValuationFlag = 'PEAK_TRAP' | 'TROUGH_BUY' | 'NEUTRAL' | 'NO_DATA';

export interface NormalizedEarnings {
  methods: Record<MethodKey, MethodResult>;
  compositeEps: number | null;
  /** Mean normalized operating margin across margin-based methods. */
  normalizedMargin: number | null;
  currentMargin: number | null;
  trailingEps: number | null;
  trailingPe: number | null;
  normalizedPe: number | null;
  flag: ValuationFlag;
  flagReason: string;
  taxRate: number;
  yearsOfHistory: number;
}

export interface NormalizationInput {
  filings: AnnualFiling[]; // PIT-known, ascending
  price: number | null; // price currency
  asOf: string;
  country: Country;
  reportingCurrency: Currency;
  priceCurrency: Currency;
  unit: MoneyUnit;
  industry: IndustryBenchmark;
}

const margin = (f: AnnualFiling): number => (f.revenue > 0 ? f.operatingIncome / f.revenue : 0);

export function taxRateFor(country: Country, reportingCurrency: Currency): number {
  return reportingCurrency === 'CAD' ? NORMALIZED_TAX_RATE.CA : NORMALIZED_TAX_RATE[country];
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Invested capital = parent equity + debt − cash. */
export function investedCapital(f: AnnualFiling): number {
  return f.totalEquity + f.totalDebt - f.cash;
}

export function computeNormalizedEarnings(input: NormalizationInput): NormalizedEarnings {
  const { filings, price, asOf, unit, industry } = input;
  const tax = taxRateFor(input.country, input.reportingCurrency);
  const latest = filings.at(-1);

  const empty = (key: MethodKey, label: string, detail: string): MethodResult => ({ key, label, eps: null, margin: null, detail });
  const LABELS: Record<MethodKey, string> = {
    A: '5Y mid-cycle operating margin',
    B: 'Through-cycle industry margin',
    C: 'Invested capital × normalized ROIC',
    D: 'Scenario-weighted margin (25/50/25)',
  };

  if (!latest) {
    return {
      methods: {
        A: empty('A', LABELS.A, 'No filing known at this date'),
        B: empty('B', LABELS.B, 'No filing known at this date'),
        C: empty('C', LABELS.C, 'No filing known at this date'),
        D: empty('D', LABELS.D, 'No filing known at this date'),
      },
      compositeEps: null,
      normalizedMargin: null,
      currentMargin: null,
      trailingEps: null,
      trailingPe: null,
      normalizedPe: null,
      flag: 'NO_DATA',
      flagReason: 'No annual report had been published by this date.',
      taxRate: tax,
      yearsOfHistory: 0,
    };
  }

  // Per-share amounts in reporting currency → price currency.
  const toPriceCcy = (eps: number) => convert(eps, input.reportingCurrency, input.priceCurrency, asOf);
  const epsFromEbit = (ebit: number): number | null => {
    const pretax = ebit - latest.interestExpense;
    const eps = toPriceCcy(perShare(pretax * (1 - tax), latest.sharesDiluted, unit));
    return eps > 0 ? eps : null;
  };

  const hist5 = filings.slice(-5);
  const hist10 = filings.slice(-10);
  const margins10 = hist10.map(margin).sort((a, b) => a - b);

  // Method A — 5-year historical mid-cycle operating margin × current revenue.
  let A: MethodResult;
  if (hist5.length >= 3) {
    const m = mean(hist5.map(margin));
    A = {
      key: 'A', label: LABELS.A, margin: m, eps: epsFromEbit(m * latest.revenue),
      detail: `avg op. margin FY${hist5[0].fiscalYear}–FY${latest.fiscalYear} (${hist5.length}y) = ${(m * 100).toFixed(1)}% × revenue ${latest.revenue.toLocaleString()}`,
    };
  } else {
    A = empty('A', LABELS.A, `Needs ≥3 known fiscal years (have ${hist5.length})`);
  }

  // Method B — through-cycle industry benchmark margin.
  const mB = industry.throughCycleMargin;
  const B: MethodResult = {
    key: 'B', label: LABELS.B, margin: mB, eps: epsFromEbit(mB * latest.revenue),
    detail: `${industry.label} through-cycle margin ${(mB * 100).toFixed(1)}% × revenue ${latest.revenue.toLocaleString()}`,
  };

  // Method C — invested capital × 10-year normalized after-tax ROIC.
  const ic = investedCapital(latest);
  let C: MethodResult;
  if (ic <= 0) {
    C = empty('C', LABELS.C, 'Invested capital ≤ 0 (net cash exceeds equity + debt)');
  } else {
    const roics = hist10.filter((f) => investedCapital(f) > 0).map((f) => (f.operatingIncome * (1 - tax)) / investedCapital(f));
    const usedCompany = roics.length >= 3;
    const roic = usedCompany ? mean(roics) : industry.normalizedRoic;
    const nopat = ic * roic;
    const pretaxEquivalent = nopat / (1 - tax);
    const eps = epsFromEbit(pretaxEquivalent);
    C = {
      key: 'C', label: LABELS.C, eps,
      margin: latest.revenue > 0 ? pretaxEquivalent / latest.revenue : null,
      detail: `IC ${ic.toLocaleString()} × ${usedCompany ? `${roics.length}y avg ROIC` : 'industry ROIC'} ${(roic * 100).toFixed(1)}%`,
    };
  }

  // Method D — bear 25% / base 50% / bull 25% operating-margin scenarios.
  const useHist = margins10.length >= 3;
  const sc = useHist
    ? { bear: percentile(margins10, 0.15), base: percentile(margins10, 0.5), bull: percentile(margins10, 0.85) }
    : industry.scenario;
  const scenarioEps = (m: number) => {
    const pretax = m * latest.revenue - latest.interestExpense;
    // Losses are taxed at 0 (no NOL credit) to stay conservative.
    const after = pretax > 0 ? pretax * (1 - tax) : pretax;
    return toPriceCcy(perShare(after, latest.sharesDiluted, unit));
  };
  const dEps = 0.25 * scenarioEps(sc.bear) + 0.5 * scenarioEps(sc.base) + 0.25 * scenarioEps(sc.bull);
  const mD = 0.25 * sc.bear + 0.5 * sc.base + 0.25 * sc.bull;
  const D: MethodResult = {
    key: 'D', label: LABELS.D, margin: mD, eps: dEps > 0 ? dEps : null,
    detail: `${useHist ? `P15/P50/P85 of ${margins10.length}y margins` : 'industry scenarios'}: ${(sc.bear * 100).toFixed(1)}% / ${(sc.base * 100).toFixed(1)}% / ${(sc.bull * 100).toFixed(1)}%`,
  };

  const methods = { A, B, C, D };
  // Composite = median of the computable methods. A method that implies a normalized loss counts as 0 (not
  // ignored); A and C are excluded only when they cannot be computed (short history / non-positive capital).
  // The median keeps one method's distortion (e.g. a write-down-heavy history in A) from dominating.
  const notComputable = (m: MethodResult) => (m.key === 'A' && hist5.length < 3) || (m.key === 'C' && ic <= 0);
  const counted = Object.values(methods).filter((m) => !notComputable(m)).map((m) => m.eps ?? 0).sort((a, b) => a - b);
  const compositeRaw = counted.length ? percentile(counted, 0.5) : null;
  const compositeEps = compositeRaw != null && compositeRaw > 0 ? compositeRaw : null;

  const marginsUsed = [A.margin, B.margin, D.margin].filter((m): m is number => m != null);
  const normalizedMargin = marginsUsed.length ? mean(marginsUsed) : null;

  const trailingEps = toPriceCcy(perShare(latest.netIncome, latest.sharesDiluted, unit));
  const trailingPe = price != null && trailingEps > 0 ? price / trailingEps : null;
  const normalizedPe = price != null && compositeEps != null ? price / compositeEps : null;

  let flag: ValuationFlag = 'NEUTRAL';
  let flagReason = 'Trailing and normalized multiples broadly agree.';
  if (price == null) {
    flag = 'NO_DATA';
    flagReason = 'No tradeable price at this date.';
  } else if (trailingPe != null && trailingPe <= 12 && (normalizedPe == null || normalizedPe >= 20)) {
    flag = 'PEAK_TRAP';
    flagReason = `Trailing P/E ${trailingPe.toFixed(1)}x looks cheap but normalized P/E is ${normalizedPe == null ? 'N/A (normalized loss)' : `${normalizedPe.toFixed(1)}x`} — peak-earnings value trap.`;
  } else if ((trailingPe == null || trailingPe > 40) && normalizedPe != null && normalizedPe < 10) {
    flag = 'TROUGH_BUY';
    flagReason = `Trailing P/E ${trailingPe == null ? 'N/A (loss)' : `${trailingPe.toFixed(1)}x`} looks expensive but normalized P/E is only ${normalizedPe.toFixed(1)}x — trough-earnings contrarian signal.`;
  }

  return {
    methods,
    compositeEps,
    normalizedMargin,
    currentMargin: margin(latest),
    trailingEps,
    trailingPe,
    normalizedPe,
    flag,
    flagReason,
    taxRate: tax,
    yearsOfHistory: filings.length,
  };
}
