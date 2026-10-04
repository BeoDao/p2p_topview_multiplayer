import type { BacktestResult } from '../engine/backtest';
import { fmtNum, fmtSignedPct } from '../lib/format';
import { quarterLabel } from '../lib/dates';
import { EquityChart } from './EquityChart';

/** Off-screen 1200×675 card rendered to PNG by html-to-image. */
export function ExportCard({ result, presetName }: { result: BacktestResult; presetName: string }) {
  const m = result.metrics;
  const c = result.config;
  const stats: [string, string][] = [
    ['Net Return', fmtSignedPct(m.totalReturn)],
    ['CAGR', fmtSignedPct(m.cagr)],
    ['Sharpe', fmtNum(m.sharpe, 2)],
    ['Max DD', fmtSignedPct(m.maxDrawdown)],
    ['Win Rate', m.winRate == null ? '—' : `${(m.winRate * 100).toFixed(0)}%`],
    ['Profit Factor', m.profitFactor == null ? '—' : Number.isFinite(m.profitFactor) ? fmtNum(m.profitFactor, 2) : '∞'],
    [`Alpha vs ${c.benchmark}`, fmtSignedPct(m.alpha)],
  ];
  const top = [...result.trades].sort((a, b) => b.returnUsd - a.returnUsd).slice(0, 4);
  return (
    <div style={{ width: 1200, height: 675 }} className="flex flex-col bg-slate-950 p-8 font-sans text-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Cyclical Value Terminal</div>
          <div className="mt-1 text-2xl font-bold text-white">{presetName}</div>
          <div className="mt-1 text-sm text-slate-400">
            {quarterLabel(result.dates[0])} → {quarterLabel(result.dates[result.dates.length - 1])} · universe {c.universe} · {c.maxPositions} max positions ·{' '}
            {c.leverage.toFixed(1)}x · {c.sizing} sizing · PIT basis: {c.basis}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          Normalized-earnings cyclical strategy
          <br />
          Data: transcribed annual reports (see provenance)
        </div>
      </div>
      <div className="mt-6 grid grid-cols-7 gap-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className="num mt-1 text-xl font-semibold text-white">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-1 gap-6">
        <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <EquityChart curve={result.curve} benchmark={c.benchmark} height={330} animate={false} />
        </div>
        <div className="w-72 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top trades</div>
          {top.map((t) => (
            <div key={t.id} className="mt-2 border-b border-slate-800 pb-2 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-white">{t.ticker}</span>
                <span className="num text-emerald-400">{fmtSignedPct(t.returnUsd)}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {quarterLabel(t.entry.date)} → {quarterLabel(t.exit.date)} · {t.reason}
              </div>
              <div className="text-[10px] text-slate-400">{t.thesis.verdict}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 text-[10px] text-slate-600">
        Past performance is hypothetical. Price return in USD, dividends excluded. Fees {c.feeBps}bps + slippage {c.slippageBps}bps
        {c.onChain ? ` + DEX ${c.dexFeeBps + c.dexSlippageBps}bps on RWA legs` : ''}.
      </div>
    </div>
  );
}
