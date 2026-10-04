import type { Currency, MoneyUnit } from '../types';

export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;

export const fmtSignedPct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;

export const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtMultiple = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? 'N/A' : v > 999 ? '>999x' : `${v.toFixed(1)}x`;

const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', KRW: '₩', JPY: '¥', CAD: 'C$' };

export function fmtPrice(v: number | null | undefined, ccy: Currency): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const digits = ccy === 'KRW' || ccy === 'JPY' ? 0 : 2;
  return `${CURRENCY_SYMBOL[ccy]}${fmtNum(v, digits)}`;
}

export const UNIT_LABEL: Record<MoneyUnit, string> = {
  USD_M: 'US$ mn',
  CAD_M: 'C$ mn',
  KRW_B: '₩ bn (십억원)',
  JPY_B: '¥ bn (十億円)',
};

export const fmtMoney = (v: number | null | undefined): string => fmtNum(v, 0);

export const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));
