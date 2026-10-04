import { daysBetween } from '../lib/dates';

export interface EquityPoint {
  date: string;
  equity: number;
  benchmark: number | null;
  grossExposure: number;
  positions: number;
  drawdown: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  cagr: number;
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number;
  winRate: number | null;
  profitFactor: number | null;
  trades: number;
  benchmarkReturn: number | null;
  benchmarkCagr: number | null;
  /** CAGR − benchmark CAGR. */
  alpha: number | null;
  /** Annualized Jensen alpha from regression of period returns on benchmark returns. */
  jensenAlpha: number | null;
  beta: number | null;
  years: number;
  avgHoldingDays: number | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export function computeMetrics(
  curve: EquityPoint[],
  trades: { pnlUsd: number; holdingDays: number }[],
  periodsPerYear: number,
  riskFreeRate: number,
): PerformanceMetrics {
  const first = curve[0];
  const last = curve[curve.length - 1];
  const years = Math.max(daysBetween(first.date, last.date) / 365.25, 1e-9);
  const totalReturn = last.equity / first.equity - 1;
  const cagr = last.equity > 0 ? Math.pow(last.equity / first.equity, 1 / years) - 1 : -1;

  const rets: number[] = [];
  const bRets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    rets.push(curve[i].equity / curve[i - 1].equity - 1);
    const b0 = curve[i - 1].benchmark;
    const b1 = curve[i].benchmark;
    bRets.push(b0 != null && b1 != null && b0 > 0 ? b1 / b0 - 1 : NaN);
  }
  const rfPer = riskFreeRate / periodsPerYear;
  const vol = rets.length > 1 ? std(rets) * Math.sqrt(periodsPerYear) : null;
  const sharpe = rets.length > 1 && std(rets) > 0 ? ((mean(rets) - rfPer) / std(rets)) * Math.sqrt(periodsPerYear) : null;
  const maxDrawdown = Math.min(0, ...curve.map((p) => p.drawdown));

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const gains = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const losses = trades.filter((t) => t.pnlUsd < 0).reduce((s, t) => s - t.pnlUsd, 0);

  let benchmarkReturn: number | null = null;
  let benchmarkCagr: number | null = null;
  if (first.benchmark != null && last.benchmark != null && first.benchmark > 0) {
    benchmarkReturn = last.benchmark / first.benchmark - 1;
    benchmarkCagr = Math.pow(last.benchmark / first.benchmark, 1 / years) - 1;
  }

  let beta: number | null = null;
  let jensenAlpha: number | null = null;
  const pairs = rets.map((r, i) => [r, bRets[i]] as const).filter(([, b]) => Number.isFinite(b));
  if (pairs.length >= 4) {
    const rs = pairs.map((p) => p[0] - rfPer);
    const bs = pairs.map((p) => p[1] - rfPer);
    const mb = mean(bs);
    const mr = mean(rs);
    const cov = bs.reduce((s, b, i) => s + (b - mb) * (rs[i] - mr), 0) / (bs.length - 1);
    const varB = std(bs) ** 2;
    if (varB > 0) {
      beta = cov / varB;
      jensenAlpha = (mr - beta * mb) * periodsPerYear;
    }
  }

  return {
    totalReturn,
    cagr,
    sharpe,
    volatility: vol,
    maxDrawdown,
    winRate: trades.length ? wins.length / trades.length : null,
    profitFactor: losses > 0 ? gains / losses : gains > 0 ? Infinity : null,
    trades: trades.length,
    benchmarkReturn,
    benchmarkCagr,
    alpha: benchmarkCagr != null ? cagr - benchmarkCagr : null,
    jensenAlpha,
    beta,
    years,
    avgHoldingDays: trades.length ? mean(trades.map((t) => t.holdingDays)) : null,
  };
}
