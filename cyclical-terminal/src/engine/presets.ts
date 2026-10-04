import type { BacktestConfig } from './backtest';
import { DEFAULT_WEIGHTS } from './scoring';

export interface Preset {
  id: string;
  emoji: string;
  name: string;
  nameKo: string;
  description: string;
  config: BacktestConfig;
}

export const BASE_CONFIG: BacktestConfig = {
  universe: 'ALL',
  startDate: '2018-01-01',
  endDate: '2025-12-31',
  frequency: 'quarterly',
  maxPositions: 6,
  sizing: 'equal',
  leverage: 1,
  feeBps: 5,
  slippageBps: 10,
  dexFeeBps: 30,
  dexSlippageBps: 25,
  onChain: false,
  borrowRate: 0.05,
  riskFreeRate: 0.02,
  basis: 'filing',
  weights: DEFAULT_WEIGHTS,
  minScore: 50,
  maxEntryNormPe: 14,
  entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery'],
  maxHoldingPeriods: 8,
  targetNormPe: 18,
  cyclePeakExit: true,
  trailingStop: 0.3,
  benchmark: 'SPY',
};

export const PRESETS: Preset[] = [
  {
    id: 'classic',
    emoji: '🔄',
    name: 'Classic Cyclical Turnaround',
    nameKo: '클래식 시클리컬 턴어라운드',
    description: 'Buy bottoming / late-downturn names on low normalized P/E; exit on Peak state, 18x normalized P/E or 30% trailing stop.',
    config: { ...BASE_CONFIG },
  },
  {
    id: 'rwa',
    emoji: '⚡',
    name: 'RWA-mapped names · stock-price proxy',
    nameKo: 'Solana RWA 매핑 종목 (주식가격 대용)',
    description: 'Long history (2018–2025) on the RWA-mapped names using LISTED-SHARE prices with Solana DEX costs overlaid. For actual token prices use the RWA Token Backtest tab.',
    config: {
      ...BASE_CONFIG,
      universe: 'RWA',
      maxPositions: 5,
      sizing: 'score',
      leverage: 1.5,
      onChain: true,
      entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery', 'Mid Recovery'],
      maxEntryNormPe: 16,
      trailingStop: 0.25,
      benchmark: 'QQQ',
    },
  },
  {
    id: 'deepvalue',
    emoji: '🛡️',
    name: 'Deep Value Margin of Safety',
    nameKo: '딥 밸류 역발상 안전마진',
    description: 'Graham-style: normalized P/E ≤ 10, heavy valuation + balance-sheet weights, long holds, no leverage.',
    config: {
      ...BASE_CONFIG,
      maxPositions: 8,
      weights: { valuation: 0.45, health: 0.3, leverage: 0.05, catalyst: 0.05, cycle: 0.15 },
      minScore: 55,
      maxEntryNormPe: 10,
      entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery', 'Mid Recovery', 'Early Downturn'],
      maxHoldingPeriods: 12,
      targetNormPe: 16,
      trailingStop: null,
    },
  },
  {
    id: 'tech',
    emoji: '🚀',
    name: 'Tech Supercycle Momentum',
    nameKo: '테크 슈퍼사이클 공격형 모멘텀',
    description: 'Semis + EV cyclicals incl. structural-growth regimes, 2x leverage, tight 25% trailing stop.',
    config: {
      ...BASE_CONFIG,
      tickers: ['MU', 'AMD', 'NVDA', 'TSLA', '000660', '005930', '8035', '6857'],
      maxPositions: 4,
      leverage: 2,
      weights: { valuation: 0.2, health: 0.1, leverage: 0.25, catalyst: 0.25, cycle: 0.2 },
      minScore: 45,
      maxEntryNormPe: 30,
      entryStates: ['Structural Growth', 'Bottoming', 'Early Recovery', 'Mid Recovery'],
      targetNormPe: 45,
      trailingStop: 0.25,
      benchmark: 'QQQ',
    },
  },
  {
    id: 'kospi',
    emoji: '🇰🇷',
    name: 'KOSPI 8 Super-Cyclicals',
    nameKo: '코스피 8대 슈퍼 시클리컬',
    description: 'HMM, Hanwha Ocean, SK hynix, Samsung, Hyundai, POSCO, LG Chem, Lotte Chemical — KOSPI benchmark.',
    config: {
      ...BASE_CONFIG,
      universe: 'KR',
      maxPositions: 4,
      entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery', 'Mid Recovery'],
      maxEntryNormPe: 16,
      benchmark: 'KOSPI',
    },
  },
  {
    id: 'japan',
    emoji: '🇯🇵',
    name: 'TSE 8 Super-Cyclicals',
    nameKo: '일본 도쿄증시 8대 슈퍼 시클리컬',
    description: 'Buffett shosha, Tokyo Electron, Advantest, Toyota, MHI, Nippon Steel — Nikkei 225 benchmark.',
    config: {
      ...BASE_CONFIG,
      universe: 'JP',
      maxPositions: 4,
      entryStates: ['Bottoming', 'Late Downturn', 'Early Recovery', 'Mid Recovery'],
      maxEntryNormPe: 16,
      targetNormPe: 22,
      benchmark: 'N225',
    },
  },
];
