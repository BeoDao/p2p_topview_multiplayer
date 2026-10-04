import type { AnnualFiling, Currency, MoneyUnit, PriceSeries } from '../types';
import { FX } from '../data/marketIndicators';
import { daysBetween } from '../lib/dates';

/**
 * Point-in-time basis.
 * - `filing`  (strict, default): a fiscal year becomes visible only on its statutory filing date
 *   (EDGAR acceptance / DART 접수일 / EDINET 提出日).
 * - `announce` (relaxed): visible from the earnings-release date (falls back to the filing date).
 * The balance-sheet date (periodEnd) is never used as a visibility key — that is the look-ahead bias this
 * engine exists to prevent.
 */
export type PitBasis = 'filing' | 'announce';

export function visibleFrom(f: AnnualFiling, basis: PitBasis): string {
  return basis === 'announce' ? (f.announceDate ?? f.filingDate) : f.filingDate;
}

/** Filings the market could have read on `asOf`, ascending by periodEnd. */
export function knownFilings(filings: AnnualFiling[], asOf: string, basis: PitBasis): AnnualFiling[] {
  return filings.filter((f) => visibleFrom(f, basis) <= asOf).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

/** Max staleness tolerated when resolving a price: one quarter plus a few days of holiday slack. */
const MAX_PRICE_STALENESS_DAYS = 100;

export interface PricePoint {
  date: string;
  price: number;
}

/** Last close on or before `asOf`; undefined if none or older than one quarter (suspension / pre-listing). */
export function priceAsOf(series: PriceSeries, asOf: string, maxStalenessDays = MAX_PRICE_STALENESS_DAYS): PricePoint | undefined {
  let best: string | undefined;
  for (const d of Object.keys(series)) if (d <= asOf && (best === undefined || d > best)) best = d;
  if (best === undefined || daysBetween(best, asOf) > maxStalenessDays) return undefined;
  return { date: best, price: series[best] };
}

/** Exact-date price (± `toleranceDays`), used when the backtest grid is finer than quarterly. */
export function priceOn(series: PriceSeries, date: string, toleranceDays: number): PricePoint | undefined {
  return priceAsOf(series, date, toleranceDays);
}

/** Local-currency units per 1 USD as of `asOf`. */
export function fxPerUsd(ccy: Currency, asOf: string): number {
  if (ccy === 'USD') return 1;
  const pair = ccy === 'KRW' ? FX.USDKRW : ccy === 'JPY' ? FX.USDJPY : FX.USDCAD;
  const p = priceAsOf(pair, asOf, 400);
  if (!p) throw new Error(`No ${ccy} FX rate on or before ${asOf}`);
  return p.price;
}

export function toUsd(amount: number, ccy: Currency, asOf: string): number {
  return amount / fxPerUsd(ccy, asOf);
}

/** Converts an amount between currencies using USD cross rates as of `asOf`. */
export function convert(amount: number, from: Currency, to: Currency, asOf: string): number {
  if (from === to) return amount;
  return (amount / fxPerUsd(from, asOf)) * fxPerUsd(to, asOf);
}

/** Absolute currency units represented by one stored unit. */
export const UNIT_SCALE: Record<MoneyUnit, number> = { USD_M: 1e6, CAD_M: 1e6, KRW_B: 1e9, JPY_B: 1e9 };

/** Per-share value (in reporting currency) of a stored money amount; shares are stored in millions. */
export function perShare(amount: number, sharesMillions: number, unit: MoneyUnit): number {
  return (amount * UNIT_SCALE[unit]) / (sharesMillions * 1e6);
}
