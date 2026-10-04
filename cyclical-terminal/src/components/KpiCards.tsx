import { Activity, ArrowDownRight, Gauge, Percent, Scale, Target, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PerformanceMetrics } from '../engine/metrics';
import { fmtNum, fmtSignedPct } from '../lib/format';

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: ReactNode; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
        <span className={tone}>{icon}</span>
      </div>
      <div className={`num mt-1 text-lg font-semibold ${tone}`}>{value}</div>
      {sub && <div className="num text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

const sign = (v: number | null | undefined) => (v == null ? 'text-slate-300' : v >= 0 ? 'text-emerald-400' : 'text-rose-400');

export function KpiCards({ m, benchmark }: { m: PerformanceMetrics | null; benchmark: string }) {
  if (!m) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-500">Run a backtest to populate KPIs.</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      <Kpi label="Net Return" value={fmtSignedPct(m.totalReturn)} sub={`${benchmark} ${fmtSignedPct(m.benchmarkReturn)}`} icon={<TrendingUp size={14} />} tone={sign(m.totalReturn)} />
      <Kpi label="CAGR" value={fmtSignedPct(m.cagr)} sub={`${m.years.toFixed(1)}y · ${benchmark} ${fmtSignedPct(m.benchmarkCagr)}`} icon={<Percent size={14} />} tone={sign(m.cagr)} />
      <Kpi label="Sharpe" value={fmtNum(m.sharpe, 2)} sub={`vol ${fmtSignedPct(m.volatility).replace('+', '')}`} icon={<Gauge size={14} />} tone="text-blue-300" />
      <Kpi label="Max Drawdown" value={fmtSignedPct(m.maxDrawdown)} sub="period-end marks" icon={<ArrowDownRight size={14} />} tone="text-rose-400" />
      <Kpi label="Win Rate" value={m.winRate == null ? '—' : `${(m.winRate * 100).toFixed(0)}%`} sub={`${m.trades} closed trades`} icon={<Target size={14} />} tone="text-purple-300" />
      <Kpi label="Profit Factor" value={m.profitFactor == null ? '—' : Number.isFinite(m.profitFactor) ? fmtNum(m.profitFactor, 2) : '∞'} sub={m.avgHoldingDays ? `avg hold ${Math.round(m.avgHoldingDays)}d` : undefined} icon={<Scale size={14} />} tone="text-amber-300" />
      <Kpi label={`Alpha vs ${benchmark}`} value={fmtSignedPct(m.alpha)} sub={`Jensen ${fmtSignedPct(m.jensenAlpha)} · β ${fmtNum(m.beta, 2)}`} icon={<Activity size={14} />} tone={sign(m.alpha)} />
    </div>
  );
}
