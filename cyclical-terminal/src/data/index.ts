import type { AnnualFiling, CompanyDataset, CompanyMeta, PriceSeries } from '../types';
import { UNIVERSE } from './universe';
import { US_GLOBAL_COMPANIES } from './realHistoricalData';
import { KOREAN_CYCLICAL_COMPANIES } from './koreanCyclicalCompanies';
import { JAPANESE_CYCLICAL_COMPANIES } from './japaneseCyclicalCompanies';

/**
 * Files written by scripts/ingest-*.mjs and scripts/import-prices.mjs. Each is a partial CompanyDataset for one
 * ticker; ingested filings replace transcribed ones with the same periodEnd and ingested prices override by date.
 */
const ingestedModules = import.meta.glob<{ default: IngestedFile }>('./ingested/*.json', { eager: true });

interface IngestedFile {
  ticker: string;
  /** Field-level overrides keyed by periodEnd; a record absent from the transcribed set must be complete. */
  filings?: (Partial<AnnualFiling> & { periodEnd: string })[];
  prices?: PriceSeries;
  source?: string;
  ingestedAt?: string;
}

export interface Company extends CompanyMeta {
  data: CompanyDataset;
  /** Per-filing provenance after merging ingested overrides. */
  filingVerification: Record<string, CompanyDataset['verification']>;
  ingestedPriceKeys: number;
}

const REQUIRED_FIELDS: (keyof AnnualFiling)[] = [
  'fiscalYear', 'periodEnd', 'filingDate', 'form', 'revenue', 'operatingIncome', 'netIncome', 'da', 'interestExpense',
  'capex', 'cash', 'totalDebt', 'totalEquity', 'totalAssets', 'currentAssets', 'currentLiabilities', 'retainedEarnings',
  'inventory', 'sharesDiluted',
];

function mergeIngested(base: CompanyDataset): {
  data: CompanyDataset;
  filingVerification: Record<string, CompanyDataset['verification']>;
  ingestedPriceKeys: number;
} {
  const filingVerification: Record<string, CompanyDataset['verification']> = {};
  for (const f of base.filings) filingVerification[f.periodEnd] = base.verification;
  const overrides = Object.values(ingestedModules)
    .map((m) => m.default)
    .filter((f) => f.ticker === base.ticker);
  if (overrides.length === 0) return { data: base, filingVerification, ingestedPriceKeys: 0 };

  const byPeriod = new Map(base.filings.map((f) => [f.periodEnd, f]));
  const prices: PriceSeries = { ...base.prices };
  let ingestedPriceKeys = 0;
  for (const o of overrides) {
    for (const f of o.filings ?? []) {
      const prior = byPeriod.get(f.periodEnd);
      const complete = REQUIRED_FIELDS.every((k) => f[k] != null);
      if (!prior && !complete) continue; // cannot add a new fiscal year from a partial record
      byPeriod.set(f.periodEnd, { ...prior, ...f } as AnnualFiling);
      filingVerification[f.periodEnd] = complete ? 'ingested' : 'mixed';
    }
    for (const [k, v] of Object.entries(o.prices ?? {})) {
      prices[k] = v;
      ingestedPriceKeys++;
    }
  }
  const filings = [...byPeriod.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return { data: { ...base, filings, prices }, filingVerification, ingestedPriceKeys };
}

const ALL_DATASETS: CompanyDataset[] = [
  ...US_GLOBAL_COMPANIES,
  ...KOREAN_CYCLICAL_COMPANIES,
  ...JAPANESE_CYCLICAL_COMPANIES,
];

const DATASET_BY_TICKER = new Map(ALL_DATASETS.map((d) => [d.ticker, d]));

/** Pre-tax-basis issuers: add interest back so operatingIncome is EBIT-equivalent everywhere downstream. */
function toEbitBasis(meta: CompanyMeta, ds: CompanyDataset): CompanyDataset {
  if (meta.operatingIncomeBasis !== 'pretax') return ds;
  return { ...ds, filings: ds.filings.map((f) => ({ ...f, operatingIncome: f.operatingIncome + f.interestExpense })) };
}

export const COMPANIES: Company[] = UNIVERSE.flatMap((meta) => {
  const ds = DATASET_BY_TICKER.get(meta.ticker);
  if (!ds) return [];
  const merged = mergeIngested(ds);
  return [{ ...meta, ...merged, data: toEbitBasis(meta, merged.data) }];
});

export const COMPANY_BY_TICKER: Record<string, Company> = Object.fromEntries(COMPANIES.map((c) => [c.ticker, c]));

export { UNIVERSE, META_BY_TICKER } from './universe';
export { INDICATORS, INDICATOR_SPECS, BENCHMARKS, BENCHMARK_SPECS, FX, WFE_ANNUAL_USD_B } from './marketIndicators';
export { INDUSTRY_BENCHMARKS, NORMALIZED_TAX_RATE } from './industryBenchmarks';
export { RWA_TOKENS, RWA_PROGRAM_LAUNCH } from './solanaRwa';
