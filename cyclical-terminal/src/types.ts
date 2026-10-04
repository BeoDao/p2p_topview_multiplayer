// Core domain types for the Cyclical Value Backtest & Solana RWA Terminal.

export type Country = 'US' | 'KR' | 'JP';
export type Currency = 'USD' | 'KRW' | 'JPY' | 'CAD';

/** Unit in which every monetary fundamental of a company is stored. Shares are always millions. */
export type MoneyUnit = 'USD_M' | 'CAD_M' | 'KRW_B' | 'JPY_B';

export type Regulator = 'SEC' | 'DART' | 'EDINET';

/**
 * How a record entered the dataset.
 * - `transcribed`: hand-compiled from the issuer's published annual report; not machine-verified
 *   against the regulator API in this build. Replace with `npm run ingest:*`.
 * - `ingested`: every field of the record came from one of the scripts/ingest-*.mjs pipelines (regulator API).
 * - `mixed`: the regulator API supplied some fields; the rest are still transcribed.
 */
export type Verification = 'transcribed' | 'ingested' | 'mixed';

export type Confidence = 'high' | 'medium' | 'low';

/** One annual report (10-K / 20-F / 40-F / 사업보고서 / 有価証券報告書). */
export interface AnnualFiling {
  /** Issuer's own fiscal-year label. */
  fiscalYear: number;
  /** Balance-sheet date, YYYY-MM-DD. */
  periodEnd: string;
  /** Statutory filing date with the regulator, YYYY-MM-DD. Strict point-in-time key. */
  filingDate: string;
  /** Earnings release / 잠정실적 / 決算短信 date, YYYY-MM-DD. Optional relaxed point-in-time key. */
  announceDate?: string;
  form: string;
  /** Regulator document id (SEC accession, DART rcept_no, EDINET docID) when known. */
  documentId?: string;
  revenue: number;
  /** Operating income (or the closest reported line; see company notes). */
  operatingIncome: number;
  /** Net income attributable to owners of the parent. */
  netIncome: number;
  /** Depreciation & amortization. */
  da: number;
  interestExpense: number;
  capex: number;
  /** Cash, equivalents and short-term investments. */
  cash: number;
  totalDebt: number;
  /** Equity attributable to owners of the parent. */
  totalEquity: number;
  totalAssets: number;
  currentAssets: number;
  currentLiabilities: number;
  retainedEarnings: number;
  inventory: number;
  /** Diluted weighted-average shares, millions, on the same split basis as the price series. */
  sharesDiluted: number;
}

/** Quarter-end close keyed by YYYY-MM-DD (calendar quarter end; last close on/before that date). */
export type PriceSeries = Record<string, number>;

export interface CompanyDataset {
  ticker: string;
  filings: AnnualFiling[];
  prices: PriceSeries;
  verification: Verification;
  confidence: { fundamentals: Confidence; prices: Confidence };
  notes?: string;
}

export type IndicatorKey =
  | 'WTI'
  | 'COPPER'
  | 'ALUMINUM'
  | 'IRON_ORE'
  | 'HRC_US'
  | 'URANIUM'
  | 'DAP'
  | 'BDI'
  | 'SCFI'
  | 'NEWBUILD'
  | 'ETHYLENE_SPREAD'
  | 'SOX'
  | 'US_SAAR'
  | 'ISM_PMI';

export type SectorKey =
  | 'Energy'
  | 'Metals & Mining'
  | 'Steel'
  | 'Chemicals'
  | 'Capital Goods'
  | 'Semiconductors'
  | 'Autos'
  | 'Shipping'
  | 'Shipbuilding'
  | 'Trading House';

export interface CompanyMeta {
  ticker: string;
  name: string;
  nameLocal?: string;
  country: Country;
  exchange: string;
  sector: SectorKey;
  /** Key into INDUSTRY_BENCHMARKS. */
  industry: string;
  /** One-line cyclical thesis. */
  thesis: string;
  reportingCurrency: Currency;
  priceCurrency: Currency;
  unit: MoneyUnit;
  regulator: Regulator;
  /** SEC CIK, DART 고유번호 (corp_code) or EDINET code. */
  regulatorId: string;
  /** Issuer stock code used by the ingestion scripts to resolve the regulator id. */
  stockCode: string;
  fiscalYearEnd: string;
  driver: IndicatorKey;
  rwaSymbol?: string;
  tradingViewSymbol: string;
  brand: { bg: string; fg: string; glyph: LogoGlyph; mark: string };
  isTech?: boolean;
  /**
   * 'pretax' when the issuer reports no operating-income line and the dataset stores pre-tax income instead.
   * The loader adds interest expense back so every engine sees an EBIT-equivalent figure.
   */
  operatingIncomeBasis?: 'pretax';
}

export type LogoGlyph =
  | 'monogram'
  | 'three-diamonds'
  | 'ellipses'
  | 'wave'
  | 'ring'
  | 'chip'
  | 'flame'
  | 'mountain'
  | 'gear'
  | 'ship'
  | 'bolt';

export type CycleState =
  | 'Structural Growth'
  | 'Early Downturn'
  | 'Late Downturn'
  | 'Bottoming'
  | 'Early Recovery'
  | 'Mid Recovery'
  | 'Late Cycle'
  | 'Peak';

export type UniverseKey = 'ALL' | 'KR' | 'JP' | 'US' | 'RWA';

export interface IndustryBenchmark {
  label: string;
  /** Through-cycle operating margin (decimal). */
  throughCycleMargin: number;
  /** Through-cycle after-tax ROIC (decimal). */
  normalizedRoic: number;
  /** Bear / base / bull operating margins used as fallback for Method D. */
  scenario: { bear: number; base: number; bull: number };
}
