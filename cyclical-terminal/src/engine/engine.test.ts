import { describe, expect, it } from 'vitest';
import { COMPANIES, COMPANY_BY_TICKER } from '../data';
import type { AnnualFiling } from '../types';
import { runBacktest, validateThesis } from './backtest';
import { classifyCycle } from './cycleClassifier';
import { computeNormalizedEarnings } from './normalizedEarnings';
import { knownFilings, priceAsOf } from './pointInTime';
import { PRESETS } from './presets';
import { computeSnapshot } from './snapshot';
import { DEFAULT_WEIGHTS } from './scoring';
import { INDUSTRY_BENCHMARKS } from '../data/industryBenchmarks';

const filing = (fy: number, revenue: number, opInc: number, ni: number, over: Partial<AnnualFiling> = {}): AnnualFiling => ({
  fiscalYear: fy,
  periodEnd: `${fy}-12-31`,
  filingDate: `${fy + 1}-02-25`,
  announceDate: `${fy + 1}-01-30`,
  form: '10-K',
  revenue,
  operatingIncome: opInc,
  netIncome: ni,
  da: 50,
  interestExpense: 10,
  capex: 60,
  cash: 100,
  totalDebt: 300,
  totalEquity: 1000,
  totalAssets: 2000,
  currentAssets: 600,
  currentLiabilities: 400,
  retainedEarnings: 500,
  inventory: 200,
  sharesDiluted: 100,
  ...over,
});

describe('point-in-time engine', () => {
  const filings = [filing(2019, 1000, 100, 70), filing(2020, 900, 30, 15)];

  it('hides a fiscal year until its statutory filing date', () => {
    expect(knownFilings(filings, '2021-02-24', 'filing').map((f) => f.fiscalYear)).toEqual([2019]);
    expect(knownFilings(filings, '2021-02-25', 'filing').map((f) => f.fiscalYear)).toEqual([2019, 2020]);
  });

  it('uses the earnings-release date only in relaxed mode', () => {
    expect(knownFilings(filings, '2021-01-30', 'announce').map((f) => f.fiscalYear)).toEqual([2019, 2020]);
    expect(knownFilings(filings, '2021-01-30', 'filing').map((f) => f.fiscalYear)).toEqual([2019]);
  });

  it('never returns a price dated after asOf and rejects stale quotes', () => {
    const series = { '2020-03-31': 10, '2020-06-30': 12 };
    expect(priceAsOf(series, '2020-06-29')?.price).toBe(10);
    expect(priceAsOf(series, '2021-06-30')).toBeUndefined();
  });

  it('no bundled company exposes a filing published after the as-of date', () => {
    for (const c of COMPANIES) {
      for (const asOf of ['2018-03-31', '2020-06-30', '2023-12-31']) {
        const s = computeSnapshot(c, asOf, 'filing', DEFAULT_WEIGHTS);
        for (const f of s.filings) expect(f.filingDate <= asOf).toBe(true);
        if (s.price) expect(s.price.date <= asOf).toBe(true);
      }
    }
  });
});

describe('normalized earnings', () => {
  const base = {
    price: 20,
    asOf: '2024-03-31',
    country: 'US' as const,
    reportingCurrency: 'USD' as const,
    priceCurrency: 'USD' as const,
    unit: 'USD_M' as const,
    industry: INDUSTRY_BENCHMARKS.steel,
  };

  it('Method A = 5-year mean margin × latest revenue, after interest and tax', () => {
    const fs = [10, 12, 8, 14, 6].map((m, i) => filing(2019 + i, 1000, m * 10, m * 7));
    const ne = computeNormalizedEarnings({ ...base, filings: fs });
    // mean margin 10% → EBIT 100 − interest 10 = 90 × (1 − 21%) = 71.1 / 100 shares
    expect(ne.methods.A.eps).toBeCloseTo(0.711, 6);
    expect(ne.methods.A.margin).toBeCloseTo(0.1, 9);
  });

  it('flags a peak-earnings trap: cheap trailing P/E, expensive normalized P/E', () => {
    const fs = [filing(2019, 1000, 20, 10), filing(2020, 1000, 25, 15), filing(2021, 1000, 15, 8), filing(2022, 1000, 20, 12), filing(2023, 3000, 900, 600)];
    const ne = computeNormalizedEarnings({ ...base, price: 40, filings: fs, industry: INDUSTRY_BENCHMARKS.container_shipping });
    expect(ne.trailingPe).toBeCloseTo(40 / 6, 6);
    expect(ne.flag).toBe('PEAK_TRAP');
  });

  it('flags a trough buy: loss-making trailing year, single-digit normalized P/E', () => {
    const fs = [filing(2019, 1000, 200, 140), filing(2020, 1000, 220, 150), filing(2021, 1000, 180, 120), filing(2022, 1000, 210, 140), filing(2023, 800, -50, -60)];
    const ne = computeNormalizedEarnings({ ...base, price: 8, filings: fs });
    expect(ne.trailingPe).toBeNull();
    expect(ne.normalizedPe).not.toBeNull();
    expect(ne.normalizedPe!).toBeLessThan(10);
    expect(ne.flag).toBe('TROUGH_BUY');
  });
});

describe('cycle classifier', () => {
  it('returns one of the eight states for every company and date', () => {
    const states = new Set<string>();
    for (const c of COMPANIES) {
      for (const d of ['2019-06-30', '2021-06-30', '2023-06-30', '2025-06-30']) {
        states.add(classifyCycle(knownFilings(c.data.filings, d, 'filing'), c.driver, d).state);
      }
    }
    expect(states.size).toBeGreaterThan(3);
  });
});

describe('thesis validation', () => {
  it('confirms operating leverage when EBIT out-runs revenue', () => {
    const snap = (fy: number, rev: number, ebit: number) => ({
      date: `${fy}-06-30`, priceLocal: 1, priceUsd: 1, state: 'Bottoming' as const, normalizedPe: 8, trailingPe: null,
      normalizedEps: 1, composite: 70, fiscalYear: fy, revenue: rev, operatingIncome: ebit, netIncome: ebit * 0.7, opMargin: ebit / rev,
    });
    const v = validateThesis(snap(2020, 1000, 50), snap(2021, 1200, 180), 0.6);
    expect(v.verdict).toBe('Operating leverage confirmed');
  });
});

describe('backtest', () => {
  it('runs every preset end-to-end with coherent accounting', () => {
    for (const p of PRESETS) {
      const r = runBacktest(COMPANIES, p.config);
      expect(r.curve.length).toBeGreaterThan(8);
      expect(r.curve.every((pt) => Number.isFinite(pt.equity))).toBe(true);
      expect(r.metrics.maxDrawdown).toBeLessThanOrEqual(0);
      expect(r.openPositionsAtEnd).toBe(0);
      for (const t of r.trades) {
        expect(t.exit.date > t.entry.date).toBe(true);
        expect(COMPANY_BY_TICKER[t.ticker]).toBeDefined();
      }
      console.log(
        `${p.id.padEnd(10)} trades=${String(r.trades.length).padStart(3)} ret=${(r.metrics.totalReturn * 100).toFixed(1)}% cagr=${(r.metrics.cagr * 100).toFixed(1)}% ` +
          `sharpe=${r.metrics.sharpe?.toFixed(2)} mdd=${(r.metrics.maxDrawdown * 100).toFixed(1)}% win=${((r.metrics.winRate ?? 0) * 100).toFixed(0)}% ` +
          `bench=${((r.metrics.benchmarkReturn ?? 0) * 100).toFixed(1)}%`,
      );
    }
  });

  it('higher costs never improve the result', () => {
    const cfg = PRESETS[0].config;
    const cheap = runBacktest(COMPANIES, { ...cfg, feeBps: 0, slippageBps: 0 });
    const dear = runBacktest(COMPANIES, { ...cfg, feeBps: 50, slippageBps: 50 });
    expect(dear.metrics.totalReturn).toBeLessThanOrEqual(cheap.metrics.totalReturn + 1e-9);
  });
});
