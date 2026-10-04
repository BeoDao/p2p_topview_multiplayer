// Solana tokenized-equity (RWA) registry.
//
// Existence of a token is NOT asserted by this file. Each symbol carries the strongest evidence available at build
// time; the authoritative answer is `scripts/ingest-rwa.mjs`, which resolves the symbol on-chain (DexScreener,
// Solana pairs with an exact base-token symbol match) and records the mint. A token is treated as tradeable in the
// RWA backtest only when such an ingested file exists.
//
// - `public-source`: named as a live xStocks token in public coverage of the programme (Solana Foundation case
//   study, Aug 2025; third-party coverage). Mint still resolved at ingestion.
// - `unverified`: requested mapping; no public confirmation found from the build sandbox. Likely absent from the
//   xStocks list (which is weighted to mega-caps/ETFs) — ingestion will show "not found" if so.

export type RwaEvidence = 'public-source' | 'unverified';

export interface RwaToken {
  symbol: string;
  underlying: string;
  issuer: string;
  evidence: RwaEvidence;
}

const X = 'xStocks (Backed Finance)';

export const RWA_TOKENS: RwaToken[] = [
  { symbol: 'NVDAx', underlying: 'NVDA', issuer: X, evidence: 'public-source' },
  { symbol: 'TSLAx', underlying: 'TSLA', issuer: X, evidence: 'public-source' },
  { symbol: 'CVXx', underlying: 'CVX', issuer: X, evidence: 'public-source' },
  { symbol: 'XOMx', underlying: 'XOM', issuer: X, evidence: 'public-source' },
  { symbol: 'AMDx', underlying: 'AMD', issuer: X, evidence: 'unverified' },
  { symbol: 'VALEx', underlying: 'VALE', issuer: X, evidence: 'unverified' },
  { symbol: 'CCJx', underlying: 'CCJ', issuer: X, evidence: 'unverified' },
  { symbol: 'OXYx', underlying: 'OXY', issuer: X, evidence: 'unverified' },
  { symbol: 'RIOx', underlying: 'RIO', issuer: X, evidence: 'unverified' },
  { symbol: 'BHPx', underlying: 'BHP', issuer: X, evidence: 'unverified' },
  { symbol: 'AAx', underlying: 'AA', issuer: X, evidence: 'unverified' },
  { symbol: 'NUEx', underlying: 'NUE', issuer: X, evidence: 'unverified' },
  { symbol: 'MOSx', underlying: 'MOS', issuer: X, evidence: 'unverified' },
  { symbol: 'FCXx', underlying: 'FCX', issuer: X, evidence: 'unverified' },
  { symbol: 'CATx', underlying: 'CAT', issuer: X, evidence: 'unverified' },
  { symbol: 'DEx', underlying: 'DE', issuer: X, evidence: 'unverified' },
];

/** Benchmark tokens fetched alongside the universe when available. */
export const RWA_BENCHMARK_TOKENS = [
  { symbol: 'SPYx', underlying: 'SPY' },
  { symbol: 'QQQx', underlying: 'QQQ' },
];

/** xStocks went live on Solana on this date (Backed Finance launch). No tokenized-equity price exists before it. */
export const RWA_PROGRAM_LAUNCH = '2025-06-30';
