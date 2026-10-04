import { describe, expect, it } from 'vitest';
import { COMPANY_BY_TICKER } from '../data';
import { DAILY_UNDERLYING, RWA_BENCHMARKS, RWA_UNIVERSE, type RwaUniverseEntry } from '../data/rwaData';
import { RWA_PROGRAM_LAUNCH } from '../data/solanaRwa';
import { runRwaBacktest } from './rwaBacktest';
import { DEFAULT_RWA_CONFIG } from './rwaPresets';

// Test-only token fixtures derived from the bundled underlying closes (premium/volume chosen per test).
function fixtureToken(symbol: string, underlying: string, premium: number, volumeUsd: number): RwaUniverseEntry {
  const u = DAILY_UNDERLYING[underlying];
  const bars = Object.fromEntries(
    Object.entries(u.closes)
      .filter(([d]) => d >= RWA_PROGRAM_LAUNCH)
      .map(([d, c]) => [d, { close: c * (1 + premium), volumeUsd }]),
  );
  const days = Object.keys(bars).sort();
  return {
    symbol, underlying, issuer: 'test', evidence: 'public-source', status: 'on-chain',
    ingested: { symbol, underlying, status: 'found', resolvedAt: '2026-01-01', source: 'test fixture', mint: 'TEST', bars },
    tokenDays: days.length, firstTokenDay: days[0], lastTokenDay: days.at(-1), underlyingDaily: u,
  };
}

const permissive = { ...DEFAULT_RWA_CONFIG, minScore: 0, maxEntryNormPe: 1000, targetNormPe: null, cyclePeakExit: false, entryStates: DEFAULT_RWA_CONFIG.entryStates.concat(['Early Downturn', 'Late Cycle', 'Peak']) };

describe('RWA backtest', () => {
  it('stock-price comparison runs on bundled daily closes, clamped to the token launch', () => {
    const r = runRwaBacktest(RWA_UNIVERSE, RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'underlying', startDate: '2024-01-01' });
    expect(r.curve[0].date >= RWA_PROGRAM_LAUNCH).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('STOCK-PRICE COMPARISON'))).toBe(true);
    expect(r.trades.length).toBeGreaterThan(0);
  });

  it('token mode refuses to run without on-chain data instead of falling back to stock prices', () => {
    const none = RWA_UNIVERSE.map((e) => ({ ...e, status: 'not-ingested' as const }));
    expect(() => runRwaBacktest(none, RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token' })).toThrow(/on-chain/);
  });

  it('excludes tokens that ingestion found are not listed', () => {
    const uni = [fixtureToken('NVDAx', 'NVDA', 0, 5e6), { ...RWA_UNIVERSE.find((e) => e.symbol === 'CATx')!, status: 'not-listed' as const }];
    const r = runRwaBacktest(uni, RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token' });
    expect(r.tradeable).toEqual(['NVDAx']);
    expect(r.excluded.find((x) => x.symbol === 'CATx')?.reason).toMatch(/not listed/);
  });

  it('caps fills at the participation limit and spreads exits over several days when liquidity is thin', () => {
    const thin = fixtureToken('NVDAx', 'NVDA', 0, 20_000); // $20k/day on-chain volume
    const r = runRwaBacktest([thin], RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token', capitalUsd: 300_000, maxPositions: 1, maxParticipation: 0.1, maxHoldingDays: 30, trailingStop: null });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) expect(t.entryParticipation!).toBeLessThanOrEqual(0.1 + 1e-9);
    // a $2k/day exit cap means a position cannot be closed in one day
    expect(r.trades.some((t) => t.exitDaysToFill >= 1 || t.reason === 'End of Backtest')).toBe(true);
    // the strategy can only ever deploy a tiny fraction of $300k into a $20k/day market
    expect(Math.max(...r.curve.map((p) => p.exposure))).toBeLessThan(0.05);
  });

  it('premium filter blocks entries when the token trades rich to the share', () => {
    const rich = fixtureToken('NVDAx', 'NVDA', 0.05, 5e6);
    const blocked = runRwaBacktest([rich], RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token', maxEntryPremium: 0.02 });
    const allowed = runRwaBacktest([rich], RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token', maxEntryPremium: null });
    expect(blocked.trades.length).toBe(0);
    expect(allowed.trades.length).toBeGreaterThan(0);
    expect(allowed.trades[0].entryPremium).toBeCloseTo(0.05, 6);
  });

  it('charges DEX costs on token legs', () => {
    const liquid = fixtureToken('NVDAx', 'NVDA', 0, 5e7);
    const cheap = runRwaBacktest([liquid], RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token', dexFeeBps: 0, baseSlippageBps: 0, impactBpsAtFullVolume: 0 });
    const dear = runRwaBacktest([liquid], RWA_BENCHMARKS, COMPANY_BY_TICKER, { ...permissive, priceSource: 'token', dexFeeBps: 50, baseSlippageBps: 50, impactBpsAtFullVolume: 500 });
    expect(dear.totalCostsUsd).toBeGreaterThan(cheap.totalCostsUsd);
    expect(dear.metrics.totalReturn).toBeLessThan(cheap.metrics.totalReturn);
  });
});
