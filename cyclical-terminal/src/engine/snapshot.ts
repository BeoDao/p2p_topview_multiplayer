import type { AnnualFiling, CycleState } from '../types';
import type { Company } from '../data';
import { INDUSTRY_BENCHMARKS } from '../data/industryBenchmarks';
import { classifyCycle, type CycleClassification } from './cycleClassifier';
import { computeNormalizedEarnings, type NormalizedEarnings } from './normalizedEarnings';
import { convert, knownFilings, priceAsOf, toUsd, UNIT_SCALE, type PitBasis, type PricePoint } from './pointInTime';
import { scoreCompany, type FactorWeights, type ScoreCard } from './scoring';

/** Everything the terminal knows about one company on one date, computed strictly point-in-time. */
export interface Snapshot {
  ticker: string;
  asOf: string;
  basis: PitBasis;
  filings: AnnualFiling[];
  latest: AnnualFiling | null;
  price: PricePoint | null;
  priceUsd: number | null;
  /** Market cap in the company's stored money unit (reporting currency). */
  marketCap: number | null;
  ne: NormalizedEarnings;
  cycle: CycleClassification;
  state: CycleState;
  score: ScoreCard | null;
  /** Filings that existed (periodEnd ≤ asOf) but were not yet public — shown in the UI as embargoed. */
  embargoed: AnnualFiling[];
}

export function computeSnapshot(
  company: Company,
  asOf: string,
  basis: PitBasis,
  weights: FactorWeights,
  normPeHistory: number[] = [],
): Snapshot {
  const filings = knownFilings(company.data.filings, asOf, basis);
  const embargoed = company.data.filings.filter((f) => f.periodEnd <= asOf && !filings.includes(f));
  const latest = filings.at(-1) ?? null;
  const price = priceAsOf(company.data.prices, asOf) ?? null;
  const priceUsd = price ? toUsd(price.price, company.priceCurrency, asOf) : null;
  const marketCap =
    price && latest
      ? (convert(price.price, company.priceCurrency, company.reportingCurrency, asOf) * latest.sharesDiluted * 1e6) /
        UNIT_SCALE[company.unit]
      : null;
  const ne = computeNormalizedEarnings({
    filings,
    price: price?.price ?? null,
    asOf,
    country: company.country,
    reportingCurrency: company.reportingCurrency,
    priceCurrency: company.priceCurrency,
    unit: company.unit,
    industry: INDUSTRY_BENCHMARKS[company.industry],
  });
  const cycle = classifyCycle(filings, company.driver, asOf);
  const score = latest
    ? scoreCompany({ filings, ne, cycle, state: cycle.state, marketCap, normPeHistory, weights })
    : null;
  return { ticker: company.ticker, asOf, basis, filings, latest, price, priceUsd, marketCap, ne, cycle, state: cycle.state, score, embargoed };
}

/**
 * Computes snapshots for every company on every date in chronological order, feeding each company's own
 * earlier normalized P/E readings into the valuation percentile (so the percentile is itself point-in-time).
 */
export function buildSnapshotStore(
  companies: Company[],
  dates: string[],
  basis: PitBasis,
  weights: FactorWeights,
): Map<string, Map<string, Snapshot>> {
  const store = new Map<string, Map<string, Snapshot>>();
  const sorted = [...dates].sort();
  for (const c of companies) {
    const byDate = new Map<string, Snapshot>();
    const history: number[] = [];
    // Callers include pre-window quarter ends in `dates` so early in-window dates are not percentile-blind.
    for (const d of sorted) {
      const s = computeSnapshot(c, d, basis, weights, history.slice(-20));
      byDate.set(d, s);
      if (s.ne.normalizedPe != null) history.push(s.ne.normalizedPe);
    }
    store.set(c.ticker, byDate);
  }
  return store;
}
