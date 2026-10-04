import { SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CycleState } from '../types';
import type { BacktestConfig, BenchmarkKey, Frequency, Sizing } from '../engine/backtest';
import { CYCLE_STATES } from '../engine/cycleClassifier';
import { FACTOR_LABELS, type FactorKey } from '../engine/scoring';
import { Card } from './ui';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const YEARS = Array.from({ length: 9 }, (_, i) => 2018 + i);

export function BacktestConfigPanel({ config, onChange, dataEnd }: {
  config: BacktestConfig;
  onChange: (c: BacktestConfig) => void;
  dataEnd: string;
}) {
  const set = <K extends keyof BacktestConfig>(k: K, v: BacktestConfig[K]) => onChange({ ...config, [k]: v });
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback);
  const toggleState = (s: CycleState) =>
    set('entryStates', config.entryStates.includes(s) ? config.entryStates.filter((x) => x !== s) : [...config.entryStates, s]);

  return (
    <Card title="Backtest Parameters" icon={<SlidersHorizontal size={14} className="text-emerald-400" />}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start year">
          <select className="input" value={config.startDate.slice(0, 4)} onChange={(e) => set('startDate', `${e.target.value}-01-01`)}>
            {YEARS.map((y) => (
              <option key={y} value={y} disabled={`${y}-01-01` > dataEnd}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="End year">
          <select className="input" value={config.endDate.slice(0, 4)} onChange={(e) => set('endDate', `${e.target.value}-12-31`)}>
            {YEARS.map((y) => (
              <option key={y} value={y} disabled={`${y}-01-01` > dataEnd}>
                {y}
                {`${y}-01-01` > dataEnd ? ' (needs ingest)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rebalance">
          <select className="input" value={config.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly (needs monthly prices)</option>
            <option value="weekly">Weekly (needs weekly prices)</option>
          </select>
        </Field>
        <Field label={`Max positions: ${config.maxPositions}`}>
          <input type="range" min={1} max={10} value={config.maxPositions} onChange={(e) => set('maxPositions', Number(e.target.value))} className="w-full accent-emerald-500" />
        </Field>
        <Field label="Sizing">
          <select className="input" value={config.sizing} onChange={(e) => set('sizing', e.target.value as Sizing)}>
            <option value="equal">Equal Weight</option>
            <option value="score">Score Weighted</option>
            <option value="risk">Equal Risk (1/σ)</option>
          </select>
        </Field>
        <Field label={`Leverage: ${config.leverage.toFixed(1)}x`}>
          <input type="range" min={1} max={3} step={0.1} value={config.leverage} onChange={(e) => set('leverage', Number(e.target.value))} className="w-full accent-emerald-500" />
        </Field>
        <Field label="Fee (bps)">
          <input className="input num" type="number" min={0} value={config.feeBps} onChange={(e) => set('feeBps', num(e.target.value, 0))} />
        </Field>
        <Field label="Slippage (bps)">
          <input className="input num" type="number" min={0} value={config.slippageBps} onChange={(e) => set('slippageBps', num(e.target.value, 0))} />
        </Field>
        <Field label="Borrow rate (%/yr)">
          <input className="input num" type="number" min={0} step={0.5} value={config.borrowRate * 100} onChange={(e) => set('borrowRate', num(e.target.value, 0) / 100)} />
        </Field>
        <Field label="Benchmark">
          <select className="input" value={config.benchmark} onChange={(e) => set('benchmark', e.target.value as BenchmarkKey)}>
            <option value="SPY">S&amp;P 500 (SPY)</option>
            <option value="QQQ">Nasdaq-100 (QQQ)</option>
            <option value="KOSPI">KOSPI (USD)</option>
            <option value="N225">Nikkei 225 (USD)</option>
          </select>
        </Field>
      </div>

      <div className="mt-3 rounded border border-purple-500/20 bg-purple-500/5 p-2">
        <label className="flex items-center gap-2 text-xs text-purple-200">
          <input type="checkbox" checked={config.onChain} onChange={(e) => set('onChain', e.target.checked)} className="accent-purple-500" />
          Execute RWA names on Solana DEX
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="DEX fee (bps)">
            <input className="input num" type="number" min={0} disabled={!config.onChain} value={config.dexFeeBps} onChange={(e) => set('dexFeeBps', num(e.target.value, 0))} />
          </Field>
          <Field label="DEX slippage (bps)">
            <input className="input num" type="number" min={0} disabled={!config.onChain} value={config.dexSlippageBps} onChange={(e) => set('dexSlippageBps', num(e.target.value, 0))} />
          </Field>
        </div>
      </div>

      <div className="mt-3">
        <span className="label">Point-in-time basis</span>
        <div className="flex gap-1">
          {(['filing', 'announce'] as const).map((b) => (
            <button
              key={b}
              onClick={() => set('basis', b)}
              className={`flex-1 rounded border px-2 py-1 text-[11px] ${config.basis === b ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-700 text-slate-400'}`}
            >
              {b === 'filing' ? 'Statutory filing (strict)' : 'Earnings release'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="label">Entry rules</span>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Min composite: ${config.minScore}`}>
            <input type="range" min={0} max={90} value={config.minScore} onChange={(e) => set('minScore', Number(e.target.value))} className="w-full accent-emerald-500" />
          </Field>
          <Field label={`Max entry norm. P/E: ${config.maxEntryNormPe}x`}>
            <input type="range" min={4} max={40} value={config.maxEntryNormPe} onChange={(e) => set('maxEntryNormPe', Number(e.target.value))} className="w-full accent-emerald-500" />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CYCLE_STATES.map((s) => (
            <button
              key={s}
              onClick={() => toggleState(s)}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${config.entryStates.includes(s) ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-500'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="label">Exit rules</span>
        <div className="space-y-2">
          <Field label={`Max holding: ${config.maxHoldingPeriods} periods`}>
            <input type="range" min={1} max={20} value={config.maxHoldingPeriods} onChange={(e) => set('maxHoldingPeriods', Number(e.target.value))} className="w-full accent-emerald-500" />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={config.targetNormPe != null} onChange={(e) => set('targetNormPe', e.target.checked ? 18 : null)} className="accent-emerald-500" />
            Fundamental target exit at norm. P/E ≥
            <input className="input num w-16" type="number" min={5} disabled={config.targetNormPe == null} value={config.targetNormPe ?? ''} onChange={(e) => set('targetNormPe', num(e.target.value, 18))} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={config.cyclePeakExit} onChange={(e) => set('cyclePeakExit', e.target.checked)} className="accent-emerald-500" />
            Cycle Peak exit (classifier → Peak)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={config.trailingStop != null} onChange={(e) => set('trailingStop', e.target.checked ? 0.3 : null)} className="accent-emerald-500" />
            Peak trailing stop
            <input className="input num w-16" type="number" min={5} max={90} disabled={config.trailingStop == null} value={config.trailingStop != null ? Math.round(config.trailingStop * 100) : ''} onChange={(e) => set('trailingStop', num(e.target.value, 30) / 100)} />%
          </label>
        </div>
      </div>

      <div className="mt-3">
        <span className="label">Factor weights</span>
        <div className="space-y-1">
          {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-28 shrink-0">{FACTOR_LABELS[k]}</span>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.05}
                value={config.weights[k]}
                onChange={(e) => set('weights', { ...config.weights, [k]: Number(e.target.value) })}
                className="flex-1 accent-blue-500"
              />
              <span className="num w-8 text-right">{(config.weights[k] * 100).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
