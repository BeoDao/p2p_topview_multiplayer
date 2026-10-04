// Daily backtester for Solana tokenized equities (xStocks).
//
// Two price sources, never mixed inside one run:
// - 'token'      : on-chain daily closes of the token itself (GeckoTerminal, ingested by scripts/ingest-rwa.mjs). Only
//                  symbols actually resolved on Solana are tradeable; costs include DEX fee, slippage and a square-root
//                  market-impact term sized against the token's trailing on-chain USD volume, and fills are capped at a
//                  fraction of that volume (exits spill over to later days when liquidity is short).
// - 'underlying' : the listed share's daily close over the same token era — an explicitly labelled stock-price
//                  comparison ("what if I had traded the stock instead"), not a token result.
// Signals (normalized earnings, cycle state, composite score) are computed point-in-time from filings published on
// or before each day, with the chosen price series as the valuation price.
import type { Company } from '../data';
import type { RwaUniverseEntry } from '../data/rwaData';
import { RWA_PROGRAM_LAUNCH } from '../data/solanaRwa';
import type { CycleState } from '../types';
import { daysBetween, quarterEnds } from '../lib/dates';
import { computeMetrics, type PerformanceMetrics } from './metrics';
import type { PitBasis } from './pointInTime';
import type { FactorWeights } from './scoring';
import { buildSnapshotStore, computeSnapshot, type Snapshot } from './snapshot';

export type RwaPriceSource = 'token' | 'underlying';
export type RwaRebalance = 'daily' | 'weekly';
export type RwaExitReason = 'Cycle Peak Exit' | 'Fundamental Target Exit' | 'Trailing Stop' | 'Max Holding Period' | 'End of Backtest';

export interface RwaBacktestConfig {
  priceSource: RwaPriceSource;
  symbols?: string[];
  startDate: string;
  endDate: string;
  rebalance: RwaRebalance;
  capitalUsd: number;
  maxPositions: number;
  sizing: 'equal' | 'score' | 'risk';
  leverage: number;
  borrowRate: number;
  riskFreeRate: number;
  // token execution
  dexFeeBps: number;
  baseSlippageBps: number;
  /** Market impact in bps when trading 100% of trailing daily volume (scaled by √participation). */
  impactBpsAtFullVolume: number;
  /** Max fraction of the 20-day average on-chain USD volume a single day's fill may use. */
  maxParticipation: number;
  /** Skip entries when token trades above the underlying by more than this (null = off). */
  maxEntryPremium: number | null;
  // stock-comparison execution
  equityFeeBps: number;
  equitySlippageBps: number;
  // signal & exit rules (same semantics as the quarterly engine)
  basis: PitBasis;
  weights: FactorWeights;
  minScore: number;
  maxEntryNormPe: number;
  entryStates: CycleState[];
  maxHoldingDays: number;
  targetNormPe: number | null;
  cyclePeakExit: boolean;
  trailingStop: number | null;
  benchmark: 'EW' | 'SPY';
}

export interface RwaTrade {
  id: number;
  symbol: string;
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  pnlUsd: number;
  holdingDays: number;
  reason: RwaExitReason;
  entryPremium: number | null;
  exitPremium: number | null;
  entryCostBps: number;
  exitCostBps: number;
  entryParticipation: number | null;
  exitDaysToFill: number;
  entryState: CycleState;
  exitState: CycleState;
  entryNormPe: number | null;
  exitNormPe: number | null;
  entryScore: number;
}

export interface RwaCurvePoint {
  date: string;
  equity: number;
  ew: number | null;
  spy: number | null;
  drawdown: number;
  exposure: number;
  positions: number;
}

export interface RwaBacktestResult {
  config: RwaBacktestConfig;
  curve: RwaCurvePoint[];
  trades: RwaTrade[];
  metrics: PerformanceMetrics;
  tradeable: string[];
  excluded: { symbol: string; reason: string }[];
  warnings: string[];
  totalCostsUsd: number;
  premiumSeries: Record<string, { date: string; premium: number }[]>;
}

interface Leg {
  entry: RwaUniverseEntry;
  company: Company;
  /** date → close of the price source used for trading and valuation. */
  px: Record<string, number>;
  dates: string[];
  /** date → USD volume (token mode only). */
  vol: Record<string, number>;
}

interface Position {
  leg: Leg;
  units: number;
  costUsd: number;
  entryDate: string;
  entryPrice: number;
  peak: number;
  entryPremium: number | null;
  entryCostBps: number;
  entryParticipation: number | null;
  entrySnap: Snapshot;
  exitReason: RwaExitReason | null;
  exitStarted: string | null;
  proceedsUsd: number;
  grossExitUsd: number;
  unitsSold: number;
  exitCostWeighted: number;
}

const lastOnOrBefore = (dates: string[], d: string): string | undefined => {
  let lo = 0;
  let hi = dates.length - 1;
  let ans: string | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= d) {
      ans = dates[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
};

function premiumOn(leg: Leg, d: string): number | null {
  const u = leg.entry.underlyingDaily;
  const bar = leg.entry.ingested?.bars?.[d];
  if (!u || !bar) return null;
  const uDates = Object.keys(u.closes).sort();
  const ud = lastOnOrBefore(uDates, d);
  if (!ud || daysBetween(ud, d) > 4) return null;
  return bar.close / u.closes[ud] - 1;
}

function adv20(leg: Leg, d: string): number | null {
  const prior = leg.dates.filter((x) => x < d).slice(-20);
  if (prior.length < 5) return null;
  return prior.reduce((s, x) => s + (leg.vol[x] ?? 0), 0) / prior.length;
}

export function buildLegs(universe: RwaUniverseEntry[], companies: Record<string, Company>, cfg: Pick<RwaBacktestConfig, 'priceSource' | 'symbols'>) {
  const legs: Leg[] = [];
  const excluded: { symbol: string; reason: string }[] = [];
  for (const e of universe) {
    if (cfg.symbols && !cfg.symbols.includes(e.symbol)) continue;
    const company = companies[e.underlying];
    if (!company) {
      excluded.push({ symbol: e.symbol, reason: 'no fundamentals dataset' });
      continue;
    }
    if (cfg.priceSource === 'token') {
      if (e.status === 'not-listed') {
        excluded.push({ symbol: e.symbol, reason: 'not listed on Solana (ingestion found no pair)' });
        continue;
      }
      if (e.status !== 'on-chain') {
        excluded.push({ symbol: e.symbol, reason: 'no on-chain price data — run `npm run ingest:rwa`' });
        continue;
      }
      const bars = e.ingested!.bars!;
      const dates = Object.keys(bars).sort();
      legs.push({
        entry: e,
        company,
        px: Object.fromEntries(dates.map((d) => [d, bars[d].close])),
        dates,
        vol: Object.fromEntries(dates.map((d) => [d, bars[d].volumeUsd])),
      });
    } else {
      if (!e.underlyingDaily) {
        excluded.push({ symbol: e.symbol, reason: `no daily ${e.underlying} closes bundled` });
        continue;
      }
      const dates = Object.keys(e.underlyingDaily.closes).sort();
      legs.push({ entry: e, company, px: e.underlyingDaily.closes, dates, vol: {} });
    }
  }
  return { legs, excluded };
}

export function runRwaBacktest(
  universe: RwaUniverseEntry[],
  benchmarks: RwaUniverseEntry[],
  companies: Record<string, Company>,
  config: RwaBacktestConfig,
): RwaBacktestResult {
  const warnings: string[] = [];
  const { legs, excluded } = buildLegs(universe, companies, config);
  if (legs.length === 0) {
    throw new Error(
      config.priceSource === 'token'
        ? 'No tokenized equity has on-chain price data yet. Run `npm run ingest:rwa` on a machine with internet access, or switch to the stock-price comparison.'
        : 'No daily underlying closes available.',
    );
  }
  const start = config.startDate < RWA_PROGRAM_LAUNCH ? RWA_PROGRAM_LAUNCH : config.startDate;
  if (config.startDate < RWA_PROGRAM_LAUNCH) warnings.push(`Start moved to ${RWA_PROGRAM_LAUNCH}: no tokenized equity traded on Solana before the xStocks launch.`);
  const grid = [...new Set(legs.flatMap((l) => l.dates))].filter((d) => d >= start && d <= config.endDate).sort();
  if (grid.length < 10) throw new Error(`Only ${grid.length} trading days between ${start} and ${config.endDate}.`);
  const isRebalance = (i: number) => config.rebalance === 'daily' || i % 7 === 0 || i === 0;

  // Point-in-time normalized-P/E history per company from quarter-end snapshots (valuation percentile input).
  const qStore = buildSnapshotStore(
    legs.map((l) => l.company),
    quarterEnds(2015, Number(config.endDate.slice(0, 4))),
    config.basis,
    config.weights,
  );
  const histFor = (t: string, d: string) =>
    [...(qStore.get(t)?.entries() ?? [])].filter(([qd, s]) => qd < d && s.ne.normalizedPe != null).map(([, s]) => s.ne.normalizedPe as number).slice(-20);

  const snapCache = new Map<string, Snapshot>();
  const snapOf = (leg: Leg, d: string): Snapshot => {
    const key = `${leg.entry.symbol}|${d}`;
    let s = snapCache.get(key);
    if (!s) {
      const view: Company = { ...leg.company, priceCurrency: 'USD', data: { ...leg.company.data, prices: leg.px } };
      s = computeSnapshot(view, d, config.basis, config.weights, histFor(leg.company.ticker, d));
      snapCache.set(key, s);
    }
    return s;
  };
  const priceOn = (leg: Leg, d: string): number | null => {
    const ld = lastOnOrBefore(leg.dates, d);
    return ld && daysBetween(ld, d) <= 5 ? leg.px[ld] : null;
  };
  const tradedToday = (leg: Leg, d: string) => leg.px[d] != null;

  const isToken = config.priceSource === 'token';
  const fixedBps = isToken ? config.dexFeeBps + config.baseSlippageBps : config.equityFeeBps + config.equitySlippageBps;
  const costBps = (leg: Leg, d: string, amountUsd: number): { bps: number; cap: number; participation: number | null } => {
    if (!isToken) return { bps: fixedBps, cap: Infinity, participation: null };
    const adv = adv20(leg, d);
    if (adv == null || adv <= 0) return { bps: fixedBps, cap: 0, participation: null };
    const participation = amountUsd / adv;
    return { bps: fixedBps + config.impactBpsAtFullVolume * Math.sqrt(Math.max(0, participation)), cap: config.maxParticipation * adv, participation };
  };

  let cash = config.capitalUsd;
  const positions = new Map<string, Position>();
  const trades: RwaTrade[] = [];
  const curve: RwaCurvePoint[] = [];
  let peakEq = cash;
  let totalCosts = 0;

  // Benchmarks: equal-weight buy & hold of the same tradeable legs, and SPY(x) on the same price source.
  const ewStart = new Map<string, number>();
  const spyEntry = benchmarks.find((b) => b.underlying === 'SPY');
  const spySeries: Record<string, number> | undefined = isToken
    ? spyEntry?.status === 'on-chain'
      ? Object.fromEntries(Object.entries(spyEntry.ingested!.bars!).map(([d, b]) => [d, b.close]))
      : undefined
    : spyEntry?.underlyingDaily?.closes;
  const spyDates = spySeries ? Object.keys(spySeries).sort() : [];
  let spyBase: number | null = null;

  for (let i = 0; i < grid.length; i++) {
    const d = grid[i];
    const last = i === grid.length - 1;
    if (i > 0 && cash < 0) cash -= -cash * config.borrowRate * (daysBetween(grid[i - 1], d) / 365.25);

    // exits (checked every day; fills limited by liquidity)
    for (const [sym, pos] of positions) {
      const leg = pos.leg;
      if (!tradedToday(leg, d) && !last) continue;
      const px = priceOn(leg, d);
      if (px == null) continue;
      pos.peak = Math.max(pos.peak, px);
      if (!pos.exitReason) {
        const s = snapOf(leg, d);
        const held = daysBetween(pos.entryDate, d);
        if (last) pos.exitReason = 'End of Backtest';
        else if (config.cyclePeakExit && s.state === 'Peak') pos.exitReason = 'Cycle Peak Exit';
        else if (config.targetNormPe != null && s.ne.normalizedPe != null && s.ne.normalizedPe >= config.targetNormPe) pos.exitReason = 'Fundamental Target Exit';
        else if (config.trailingStop != null && px <= pos.peak * (1 - config.trailingStop)) pos.exitReason = 'Trailing Stop';
        else if (held >= config.maxHoldingDays) pos.exitReason = 'Max Holding Period';
        if (pos.exitReason) pos.exitStarted = d;
      }
      if (!pos.exitReason) continue;
      const remaining = pos.units - pos.unitsSold;
      const want = remaining * px;
      const { bps, cap } = costBps(leg, d, want);
      // On the final day everything is marked out at the close with the computed cost (no spill-over possible).
      const sellUsd = last ? want : Math.min(want, cap);
      if (sellUsd <= 0) continue;
      const proceeds = sellUsd * (1 - bps / 1e4);
      totalCosts += sellUsd - proceeds;
      cash += proceeds;
      pos.proceedsUsd += proceeds;
      pos.grossExitUsd += sellUsd;
      pos.exitCostWeighted += bps * sellUsd;
      pos.unitsSold += sellUsd / px;
      if (pos.units - pos.unitsSold > 1e-9) continue; // partial fill — keep selling on later days
      const s = snapOf(leg, d);
      trades.push({
        id: trades.length + 1,
        symbol: sym,
        ticker: leg.company.ticker,
        entryDate: pos.entryDate,
        exitDate: d,
        entryPrice: pos.entryPrice,
        exitPrice: pos.grossExitUsd / pos.units,
        returnPct: pos.proceedsUsd / pos.costUsd - 1,
        pnlUsd: pos.proceedsUsd - pos.costUsd,
        holdingDays: daysBetween(pos.entryDate, d),
        reason: pos.exitReason,
        entryPremium: pos.entryPremium,
        exitPremium: isToken ? premiumOn(leg, d) : null,
        entryCostBps: pos.entryCostBps,
        exitCostBps: pos.exitCostWeighted / Math.max(1e-9, pos.grossExitUsd),
        entryParticipation: pos.entryParticipation,
        exitDaysToFill: pos.exitStarted ? daysBetween(pos.exitStarted, d) : 0,
        entryState: pos.entrySnap.state,
        exitState: s.state,
        entryNormPe: pos.entrySnap.ne.normalizedPe,
        exitNormPe: s.ne.normalizedPe,
        entryScore: pos.entrySnap.score?.composite ?? 0,
      });
      positions.delete(sym);
    }

    const markValue = () =>
      [...positions.values()].reduce((s, p) => s + (p.units - p.unitsSold) * (priceOn(p.leg, d) ?? p.entryPrice), 0);
    let equity = cash + markValue();

    // entries
    if (!last && isRebalance(i) && equity > 0) {
      const free = config.maxPositions - positions.size;
      const cands = legs
        .filter((l) => !positions.has(l.entry.symbol) && tradedToday(l, d))
        .map((l) => ({ l, s: snapOf(l, d), prem: isToken ? premiumOn(l, d) : null }))
        .filter(
          ({ s, prem }) =>
            s.score != null &&
            s.score.composite >= config.minScore &&
            config.entryStates.includes(s.state) &&
            s.ne.normalizedPe != null &&
            s.ne.normalizedPe <= config.maxEntryNormPe &&
            (config.targetNormPe == null || s.ne.normalizedPe < config.targetNormPe) &&
            (config.maxEntryPremium == null || prem == null || prem <= config.maxEntryPremium),
        )
        .sort((a, b) => b.s.score!.composite - a.s.score!.composite)
        .slice(0, Math.max(0, free));
      const base = 1 / config.maxPositions;
      const vols = cands.map(({ l }) => {
        const ds = l.dates.filter((x) => x <= d).slice(-61);
        const r = ds.slice(1).map((x, k) => Math.log(l.px[x] / l.px[ds[k]]));
        if (r.length < 10) return 0.03;
        const m = r.reduce((a, b) => a + b, 0) / r.length;
        return Math.max(0.005, Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)));
      });
      const raw = cands.map(({ s }, k) =>
        config.sizing === 'score' ? s.score!.composite : config.sizing === 'risk' ? 1 / vols[k] : 1,
      );
      const avg = raw.length ? raw.reduce((a, b) => a + b, 0) / raw.length : 1;
      cands.forEach(({ l, s, prem }, k) => {
        const w = Math.min(2 * base, (raw[k] / avg) * base);
        const gross = markValue();
        const target = Math.min(w * config.leverage * equity, config.leverage * equity - gross);
        const { bps, cap, participation } = costBps(l, d, target);
        const amount = Math.min(target, cap);
        if (amount < equity * 0.005) return;
        const px = l.px[d];
        const units = (amount * (1 - bps / 1e4)) / px;
        totalCosts += amount * (bps / 1e4);
        cash -= amount;
        positions.set(l.entry.symbol, {
          leg: l,
          units,
          costUsd: amount,
          entryDate: d,
          entryPrice: px,
          peak: px,
          entryPremium: prem,
          entryCostBps: bps,
          entryParticipation: participation != null ? participation * (amount / Math.max(target, 1e-9)) : null,
          entrySnap: s,
          exitReason: null,
          exitStarted: null,
          proceedsUsd: 0,
          grossExitUsd: 0,
          unitsSold: 0,
          exitCostWeighted: 0,
        });
      });
      equity = cash + markValue();
    }

    // benchmarks
    let ewVal = 0;
    let ewN = 0;
    for (const l of legs) {
      const px = priceOn(l, d);
      if (px == null) continue;
      if (!ewStart.has(l.entry.symbol)) ewStart.set(l.entry.symbol, px);
      ewVal += px / ewStart.get(l.entry.symbol)!;
      ewN++;
    }
    let spy: number | null = null;
    if (spySeries) {
      const sd = lastOnOrBefore(spyDates, d);
      if (sd && daysBetween(sd, d) <= 5) {
        if (spyBase == null) spyBase = spySeries[sd];
        spy = (spySeries[sd] / spyBase) * config.capitalUsd;
      }
    }
    peakEq = Math.max(peakEq, equity);
    const exposure = equity > 0 ? markValue() / equity : 0;
    curve.push({
      date: d,
      equity,
      ew: ewN ? (ewVal / ewN) * config.capitalUsd : null,
      spy,
      drawdown: equity / peakEq - 1,
      exposure,
      positions: positions.size,
    });
  }

  const ppy = isToken ? 365 : 252;
  const metrics = computeMetrics(
    curve.map((p) => ({ date: p.date, equity: p.equity, benchmark: config.benchmark === 'SPY' ? p.spy : p.ew, grossExposure: p.exposure, positions: p.positions, drawdown: p.drawdown })),
    trades.map((t) => ({ pnlUsd: t.pnlUsd, holdingDays: t.holdingDays })),
    ppy,
    config.riskFreeRate,
  );

  const premiumSeries: RwaBacktestResult['premiumSeries'] = {};
  if (isToken) {
    for (const l of legs) {
      premiumSeries[l.entry.symbol] = grid.flatMap((d) => {
        const p = premiumOn(l, d);
        return p == null ? [] : [{ date: d, premium: p }];
      });
    }
  }

  if (!isToken) warnings.push('STOCK-PRICE COMPARISON: these results use the listed shares’ daily closes, not token prices. They show what the same signals would have earned on the stock over the token era.');
  if (isToken && config.benchmark === 'SPY' && !spySeries) warnings.push('SPYx has no ingested on-chain data — alpha is reported against the equal-weight token basket instead.');
  warnings.push('Price return only; dividends (xStocks reinvest/pass through per issuer terms) are excluded.');
  if (grid.length < 250) warnings.push(`Short sample: ${grid.length} trading days. Treat Sharpe/CAGR as indicative only.`);

  return {
    config,
    curve,
    trades,
    metrics,
    tradeable: legs.map((l) => l.entry.symbol),
    excluded,
    warnings,
    totalCostsUsd: totalCosts,
    premiumSeries,
  };
}
