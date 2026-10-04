import type { CycleState, UniverseKey } from '../types';
import type { Company } from '../data';
import { BENCHMARKS } from '../data/marketIndicators';
import { RWA_PROGRAM_LAUNCH } from '../data/solanaRwa';
import { daysBetween, monthEnds, quarterEnds, weekEnds } from '../lib/dates';
import { computeMetrics, type EquityPoint, type PerformanceMetrics } from './metrics';
import { priceAsOf, toUsd, type PitBasis } from './pointInTime';
import { buildSnapshotStore, type Snapshot } from './snapshot';
import type { FactorWeights } from './scoring';

export type Frequency = 'quarterly' | 'monthly' | 'weekly';
export type Sizing = 'equal' | 'score' | 'risk';
export type BenchmarkKey = 'SPY' | 'QQQ' | 'KOSPI' | 'N225';
export type ExitReason = 'Cycle Peak Exit' | 'Fundamental Target Exit' | 'Trailing Stop' | 'Max Holding Period' | 'End of Backtest';

export interface BacktestConfig {
  universe: UniverseKey;
  tickers?: string[];
  startDate: string;
  endDate: string;
  frequency: Frequency;
  maxPositions: number;
  sizing: Sizing;
  leverage: number;
  feeBps: number;
  slippageBps: number;
  /** Applied on top of fee/slippage to RWA-eligible names when `onChain` is true. */
  dexFeeBps: number;
  dexSlippageBps: number;
  onChain: boolean;
  borrowRate: number;
  riskFreeRate: number;
  basis: PitBasis;
  weights: FactorWeights;
  minScore: number;
  maxEntryNormPe: number;
  entryStates: CycleState[];
  maxHoldingPeriods: number;
  targetNormPe: number | null;
  cyclePeakExit: boolean;
  trailingStop: number | null;
  benchmark: BenchmarkKey;
}

export interface TradeSnapshot {
  date: string;
  priceLocal: number;
  priceUsd: number;
  state: CycleState;
  normalizedPe: number | null;
  trailingPe: number | null;
  normalizedEps: number | null;
  composite: number;
  fiscalYear: number | null;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  opMargin: number | null;
}

export interface ThesisValidation {
  testable: boolean;
  revenueChange: number | null;
  ebitChange: number | null;
  marginChangePp: number | null;
  normalizedEpsChange: number | null;
  multipleChange: number | null;
  operatingLeverageRealized: boolean;
  verdict: 'Operating leverage confirmed' | 'Multiple re-rating only' | 'Thesis failed' | 'Not yet testable';
  narrative: string;
}

export interface Trade {
  id: number;
  ticker: string;
  entry: TradeSnapshot;
  exit: TradeSnapshot;
  reason: ExitReason;
  returnLocal: number;
  returnUsd: number;
  pnlUsd: number;
  holdingDays: number;
  periods: number;
  costBps: number;
  /** RWA leg executed with DEX costs but priced off the listed share (the quarterly engine never uses token prices). */
  rwaPriceProxy: boolean;
  thesis: ThesisValidation;
}

export interface BacktestResult {
  config: BacktestConfig;
  curve: EquityPoint[];
  trades: Trade[];
  metrics: PerformanceMetrics;
  dates: string[];
  warnings: string[];
  openPositionsAtEnd: number;
}

interface Position {
  ticker: string;
  units: number;
  costUsd: number;
  entry: TradeSnapshot;
  peakLocal: number;
  periods: number;
  costBps: number;
}

export function universeFilter(universe: UniverseKey, c: Company): boolean {
  switch (universe) {
    case 'ALL':
      return true;
    case 'KR':
    case 'JP':
    case 'US':
      return c.country === universe;
    case 'RWA':
      return c.rwaSymbol != null;
  }
}

/** Dates on which ≥ half of the selected companies carry an exact price (within a few days). */
export function buildGrid(companies: Company[], frequency: Frequency, start: string, end: string): string[] {
  const y0 = Number(start.slice(0, 4)) - 1;
  const y1 = Number(end.slice(0, 4));
  const raw = frequency === 'quarterly' ? quarterEnds(y0, y1) : frequency === 'monthly' ? monthEnds(y0, y1) : weekEnds(y0, y1);
  const tolerance = frequency === 'weekly' ? 3 : 5;
  return raw.filter((d) => {
    if (d < start || d > end) return false;
    if (frequency === 'quarterly') return companies.some((c) => priceAsOf(c.data.prices, d, tolerance));
    const n = companies.filter((c) => priceAsOf(c.data.prices, d, tolerance)).length;
    return n >= Math.ceil(companies.length / 2);
  });
}

function tradeSnapshot(s: Snapshot): TradeSnapshot {
  const l = s.latest;
  return {
    date: s.asOf,
    priceLocal: s.price?.price ?? NaN,
    priceUsd: s.priceUsd ?? NaN,
    state: s.state,
    normalizedPe: s.ne.normalizedPe,
    trailingPe: s.ne.trailingPe,
    normalizedEps: s.ne.compositeEps,
    composite: s.score?.composite ?? 0,
    fiscalYear: l?.fiscalYear ?? null,
    revenue: l?.revenue ?? null,
    operatingIncome: l?.operatingIncome ?? null,
    netIncome: l?.netIncome ?? null,
    opMargin: l && l.revenue > 0 ? l.operatingIncome / l.revenue : null,
  };
}

/** Post-mortem: did the stock rise because operating leverage actually showed up in reported numbers? */
export function validateThesis(entry: TradeSnapshot, exit: TradeSnapshot, ret: number): ThesisValidation {
  const testable = entry.fiscalYear != null && exit.fiscalYear != null && exit.fiscalYear > entry.fiscalYear;
  const chg = (a: number | null, b: number | null) => (a != null && b != null && a !== 0 ? (b - a) / Math.abs(a) : null);
  const revenueChange = chg(entry.revenue, exit.revenue);
  const ebitChange = chg(entry.operatingIncome, exit.operatingIncome);
  const marginChangePp = entry.opMargin != null && exit.opMargin != null ? (exit.opMargin - entry.opMargin) * 100 : null;
  const normalizedEpsChange = chg(entry.normalizedEps, exit.normalizedEps);
  const multipleChange = chg(entry.normalizedPe, exit.normalizedPe);
  const operatingLeverageRealized =
    testable &&
    ((revenueChange != null && revenueChange > 0 && ebitChange != null && ebitChange > 1.5 * revenueChange) ||
      (marginChangePp != null && marginChangePp >= 3));

  let verdict: ThesisValidation['verdict'];
  let narrative: string;
  if (!testable) {
    verdict = 'Not yet testable';
    narrative = 'No new annual report was published during the holding period, so the move cannot be attributed to reported operating results.';
  } else if (operatingLeverageRealized && ret > 0) {
    verdict = 'Operating leverage confirmed';
    narrative = `Revenue ${fmt(revenueChange)} vs operating income ${fmt(ebitChange)} (margin ${marginChangePp != null ? `${marginChangePp >= 0 ? '+' : ''}${marginChangePp.toFixed(1)}pp` : 'n/a'}): fixed-cost absorption drove earnings faster than sales.`;
  } else if (ret > 0) {
    verdict = 'Multiple re-rating only';
    narrative = `Price rose ${fmt(ret)} but reported operating income ${fmt(ebitChange)} did not out-run revenue ${fmt(revenueChange)} — gain came from sentiment / multiple expansion, not proven operating leverage.`;
  } else {
    verdict = 'Thesis failed';
    narrative = `Return ${fmt(ret)}; operating income ${fmt(ebitChange)}, margin ${marginChangePp != null ? `${marginChangePp.toFixed(1)}pp` : 'n/a'} — the expected earnings recovery did not materialize within the holding window.`;
  }
  return { testable, revenueChange, ebitChange, marginChangePp, normalizedEpsChange, multipleChange, operatingLeverageRealized, verdict, narrative };
}

const fmt = (v: number | null) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`);

function benchmarkUsd(key: BenchmarkKey, date: string): number | null {
  const p = priceAsOf(BENCHMARKS[key], date, 10);
  if (!p) return null;
  if (key === 'KOSPI') return toUsd(p.price, 'KRW', date);
  if (key === 'N225') return toUsd(p.price, 'JPY', date);
  return p.price;
}

const PERIODS_PER_YEAR: Record<Frequency, number> = { quarterly: 4, monthly: 12, weekly: 52 };

function trailingVol(c: Company, dates: string[], i: number): number {
  const rets: number[] = [];
  for (let k = Math.max(1, i - 8); k <= i; k++) {
    const a = priceAsOf(c.data.prices, dates[k - 1]);
    const b = priceAsOf(c.data.prices, dates[k]);
    if (a && b && a.price > 0) rets.push(Math.log(b.price / a.price));
  }
  if (rets.length < 3) return 0.4;
  const m = rets.reduce((s, r) => s + r, 0) / rets.length;
  return Math.max(0.05, Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1)));
}

export function runBacktest(allCompanies: Company[], config: BacktestConfig): BacktestResult {
  const warnings: string[] = [];
  const companies = allCompanies.filter(
    (c) => universeFilter(config.universe, c) && (!config.tickers || config.tickers.includes(c.ticker)),
  );
  if (companies.length === 0) throw new Error('Universe is empty.');
  const dates = buildGrid(companies, config.frequency, config.startDate, config.endDate);
  if (dates.length < 3) {
    throw new Error(
      `Not enough ${config.frequency} price observations between ${config.startDate} and ${config.endDate}. ` +
        (config.frequency !== 'quarterly' ? 'The bundled dataset is quarterly — import finer prices with `npm run import:prices`.' : ''),
    );
  }
  // Pre-window quarter ends seed each company's normalized-P/E percentile history (still point-in-time).
  const seed = quarterEnds(2015, Number(config.startDate.slice(0, 4))).filter((d) => d < dates[0]);
  const store = buildSnapshotStore(companies, [...seed, ...dates], config.basis, config.weights);
  const snap = (t: string, d: string) => store.get(t)?.get(d);

  const capital = 1_000_000;
  let cash = capital;
  const positions = new Map<string, Position>();
  const trades: Trade[] = [];
  const curve: EquityPoint[] = [];
  let peakEquity = capital;
  let benchBase: number | null = null;
  const ppy = PERIODS_PER_YEAR[config.frequency];
  let rwaProxyUsed = false;

  const costFor = (c: Company) =>
    config.feeBps + config.slippageBps + (config.onChain && c.rwaSymbol ? config.dexFeeBps + config.dexSlippageBps : 0);
  const priceUsdAt = (c: Company, d: string): number | null => {
    const p = priceAsOf(c.data.prices, d);
    return p ? toUsd(p.price, c.priceCurrency, d) : null;
  };
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const isLast = i === dates.length - 1;

    // 1) financing cost on borrowed cash for the elapsed period
    if (i > 0 && cash < 0) cash -= -cash * config.borrowRate * (daysBetween(dates[i - 1], d) / 365.25);

    // 2) exits
    const exitedToday = new Set<string>();
    for (const [t, pos] of positions) {
      const c = byTicker.get(t)!;
      const s = snap(t, d);
      const pUsd = priceUsdAt(c, d);
      if (!s || !s.price || pUsd == null) continue; // untradeable today (suspension) — hold
      pos.periods++;
      pos.peakLocal = Math.max(pos.peakLocal, s.price.price);
      let reason: ExitReason | null = null;
      if (isLast) reason = 'End of Backtest';
      else if (config.cyclePeakExit && s.state === 'Peak') reason = 'Cycle Peak Exit';
      else if (config.targetNormPe != null && s.ne.normalizedPe != null && s.ne.normalizedPe >= config.targetNormPe)
        reason = 'Fundamental Target Exit';
      else if (config.trailingStop != null && s.price.price <= pos.peakLocal * (1 - config.trailingStop)) reason = 'Trailing Stop';
      else if (pos.periods >= config.maxHoldingPeriods) reason = 'Max Holding Period';
      if (!reason) continue;

      const proceeds = pos.units * pUsd * (1 - costFor(c) / 1e4);
      cash += proceeds;
      const exit = tradeSnapshot(s);
      const returnUsd = proceeds / pos.costUsd - 1;
      const returnLocal = exit.priceLocal / pos.entry.priceLocal - 1;
      const proxy = config.onChain && c.rwaSymbol != null;
      rwaProxyUsed ||= proxy;
      trades.push({
        id: trades.length + 1,
        ticker: t,
        entry: pos.entry,
        exit,
        reason,
        returnLocal,
        returnUsd,
        pnlUsd: proceeds - pos.costUsd,
        holdingDays: daysBetween(pos.entry.date, d),
        periods: pos.periods,
        costBps: pos.costBps,
        rwaPriceProxy: proxy,
        thesis: validateThesis(pos.entry, exit, returnLocal),
      });
      positions.delete(t);
      exitedToday.add(t);
    }

    // 3) mark to market
    let posValue = 0;
    for (const [t, pos] of positions) {
      const pUsd = priceUsdAt(byTicker.get(t)!, d);
      posValue += pos.units * (pUsd ?? pos.costUsd / pos.units);
    }
    let equity = cash + posValue;

    // 4) entries
    if (!isLast && equity > 0) {
      const free = config.maxPositions - positions.size;
      if (free > 0) {
        const candidates = companies
          .map((c) => ({ c, s: snap(c.ticker, d) }))
          .filter(
            (x): x is { c: Company; s: Snapshot } =>
              !!x.s &&
              !!x.s.price &&
              !!x.s.score &&
              !positions.has(x.c.ticker) &&
              !exitedToday.has(x.c.ticker) &&
              x.s.score.composite >= config.minScore &&
              config.entryStates.includes(x.s.state) &&
              x.s.ne.normalizedPe != null &&
              x.s.ne.normalizedPe <= config.maxEntryNormPe &&
              (config.targetNormPe == null || x.s.ne.normalizedPe < config.targetNormPe),
          )
          .sort((a, b) => b.s.score!.composite - a.s.score!.composite)
          .slice(0, free);

        if (candidates.length) {
          const base = 1 / config.maxPositions;
          let rawW: number[];
          if (config.sizing === 'score') {
            const avg = candidates.reduce((s, x) => s + x.s.score!.composite, 0) / candidates.length;
            rawW = candidates.map((x) => (x.s.score!.composite / avg) * base);
          } else if (config.sizing === 'risk') {
            const inv = candidates.map((x) => 1 / trailingVol(x.c, dates, i));
            const avg = inv.reduce((a, b) => a + b, 0) / inv.length;
            rawW = inv.map((v) => (v / avg) * base);
          } else {
            rawW = candidates.map(() => base);
          }
          for (let k = 0; k < candidates.length; k++) {
            const { c, s } = candidates[k];
            const w = Math.min(rawW[k], 2 * base);
            const gross = [...positions.values()].reduce((sum, p) => sum + p.units * (priceUsdAt(byTicker.get(p.ticker)!, d) ?? 0), 0);
            const room = config.leverage * equity - gross;
            const amount = Math.min(w * config.leverage * equity, room);
            if (amount < equity * 0.005 || s.priceUsd == null) continue;
            const bps = costFor(c);
            const units = (amount * (1 - bps / 1e4)) / s.priceUsd;
            cash -= amount;
            positions.set(c.ticker, {
              ticker: c.ticker,
              units,
              costUsd: amount,
              entry: tradeSnapshot(s),
              peakLocal: s.price!.price,
              periods: 0,
              costBps: bps,
            });
          }
        }
      }
      // re-mark after entries (costs reduce equity immediately)
      posValue = 0;
      for (const [t, pos] of positions) posValue += pos.units * (priceUsdAt(byTicker.get(t)!, d) ?? 0);
      equity = cash + posValue;
    }

    peakEquity = Math.max(peakEquity, equity);
    const b = benchmarkUsd(config.benchmark, d);
    if (benchBase == null && b != null) benchBase = b;
    curve.push({
      date: d,
      equity,
      benchmark: b != null && benchBase != null ? (b / benchBase) * capital : null,
      grossExposure: equity > 0 ? posValue / equity : 0,
      positions: positions.size,
      drawdown: equity / peakEquity - 1,
    });
  }

  if (rwaProxyUsed) {
    warnings.push(
      `On-chain mode here is a COST overlay only: every RWA leg is priced off the listed share's quarter-end close plus DEX fee/slippage. ` +
        `Tokens only exist since ${RWA_PROGRAM_LAUNCH}; use the "RWA Token Backtest" tab for results on actual on-chain token prices.`,
    );
  }
  if (config.frequency === 'quarterly') {
    warnings.push('Equity is marked quarterly; intra-quarter drawdowns are not observed, so MDD is understated versus daily marking.');
  }
  warnings.push('Price return only (dividends excluded). All P&L converted to USD at quarter-end FX.');

  const metrics = computeMetrics(curve, trades, ppy, config.riskFreeRate);
  return { config, curve, trades, metrics, dates, warnings, openPositionsAtEnd: positions.size };
}
