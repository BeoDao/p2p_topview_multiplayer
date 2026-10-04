import { RWA_UNIVERSE } from '../data/rwaData';
import { RWA_PROGRAM_LAUNCH } from '../data/solanaRwa';
import type { RwaBacktestConfig } from './rwaBacktest';
import { DEFAULT_WEIGHTS } from './scoring';

/** Number of tokens with ingested on-chain daily bars. */
export const ON_CHAIN = RWA_UNIVERSE.filter((e) => e.status === 'on-chain').length;

export const DEFAULT_RWA_CONFIG: RwaBacktestConfig = {
  priceSource: ON_CHAIN > 0 ? 'token' : 'underlying',
  startDate: RWA_PROGRAM_LAUNCH,
  endDate: '2026-12-31',
  rebalance: 'weekly',
  capitalUsd: 100_000,
  maxPositions: 4,
  sizing: 'equal',
  leverage: 1,
  borrowRate: 0.08,
  riskFreeRate: 0.04,
  dexFeeBps: 25,
  baseSlippageBps: 15,
  impactBpsAtFullVolume: 300,
  maxParticipation: 0.1,
  maxEntryPremium: 0.02,
  equityFeeBps: 5,
  equitySlippageBps: 5,
  basis: 'filing',
  weights: DEFAULT_WEIGHTS,
  minScore: 40,
  maxEntryNormPe: 30,
  entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery', 'Mid Recovery', 'Structural Growth'],
  maxHoldingDays: 180,
  targetNormPe: 40,
  cyclePeakExit: true,
  trailingStop: 0.2,
  benchmark: 'EW',
};

