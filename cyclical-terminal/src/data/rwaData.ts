import { RWA_BENCHMARK_TOKENS, RWA_TOKENS, type RwaToken } from './solanaRwa';

/** Daily on-chain bar for a tokenized equity (UTC day, USD). */
export interface TokenBar {
  close: number;
  volumeUsd: number;
}

/** File written by scripts/ingest-rwa.mjs for every symbol it tried to resolve. */
export interface RwaIngestedFile {
  symbol: string;
  underlying: string;
  status: 'found' | 'not-found';
  resolvedAt: string;
  source: string;
  mint?: string;
  name?: string;
  pairAddress?: string;
  dexId?: string;
  liquidityUsd?: number;
  bars?: Record<string, TokenBar>;
}

/** Daily closes of an underlying listed equity (written by ingest-rwa.mjs or bundled from a public mirror). */
export interface DailyUnderlyingFile {
  ticker: string;
  source: string;
  closes: Record<string, number>;
  volumes?: Record<string, number>;
}

const rwaModules = import.meta.glob<{ default: RwaIngestedFile }>('./ingested/rwa/*.json', { eager: true });
const dailyModules = import.meta.glob<{ default: DailyUnderlyingFile }>('./ingested/daily/*.json', { eager: true });

export const RWA_INGESTED: Record<string, RwaIngestedFile> = Object.fromEntries(
  Object.values(rwaModules).map((m) => [m.default.symbol, m.default]),
);

export const DAILY_UNDERLYING: Record<string, DailyUnderlyingFile> = Object.fromEntries(
  Object.values(dailyModules).map((m) => [m.default.ticker, m.default]),
);

export type RwaDataStatus =
  | 'on-chain' // token resolved on Solana with daily bars
  | 'not-listed' // ingestion searched Solana and found no pair with this symbol
  | 'not-ingested'; // ingestion never run for this symbol

export interface RwaUniverseEntry extends RwaToken {
  status: RwaDataStatus;
  ingested?: RwaIngestedFile;
  tokenDays: number;
  firstTokenDay?: string;
  lastTokenDay?: string;
  underlyingDaily?: DailyUnderlyingFile;
}

function entry(t: RwaToken): RwaUniverseEntry {
  const ing = RWA_INGESTED[t.symbol];
  const days = ing?.bars ? Object.keys(ing.bars).sort() : [];
  const status: RwaDataStatus =
    ing?.status === 'found' && days.length > 0 ? 'on-chain' : ing?.status === 'not-found' ? 'not-listed' : 'not-ingested';
  return {
    ...t,
    status,
    ingested: ing,
    tokenDays: days.length,
    firstTokenDay: days[0],
    lastTokenDay: days[days.length - 1],
    underlyingDaily: DAILY_UNDERLYING[t.underlying],
  };
}

export const RWA_UNIVERSE: RwaUniverseEntry[] = RWA_TOKENS.map(entry);

export const RWA_BENCHMARKS: RwaUniverseEntry[] = RWA_BENCHMARK_TOKENS.map((b) =>
  entry({ ...b, issuer: 'xStocks (Backed Finance)', evidence: 'public-source' }),
);
