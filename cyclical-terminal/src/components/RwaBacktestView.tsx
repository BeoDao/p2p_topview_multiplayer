import { AlertTriangle, Coins, Database, LineChart as LineIcon, Terminal } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COMPANY_BY_TICKER } from '../data';
import { RWA_BENCHMARKS, RWA_UNIVERSE, type RwaUniverseEntry } from '../data/rwaData';
import { RWA_PROGRAM_LAUNCH } from '../data/solanaRwa';
import { CYCLE_STATES } from '../engine/cycleClassifier';
import { runRwaBacktest, type RwaBacktestConfig, type RwaBacktestResult } from '../engine/rwaBacktest';
import { DEFAULT_RWA_CONFIG, ON_CHAIN } from '../engine/rwaPresets';
import { fmtNum, fmtPct, fmtSignedPct } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { KpiCards } from './KpiCards';
import { Badge, Card, StateBadge } from './ui';

const STATUS_UI: Record<RwaUniverseEntry['status'], { tone: 'emerald' | 'rose' | 'slate'; label: string }> = {
  'on-chain': { tone: 'emerald', label: 'on-chain data' },
  'not-listed': { tone: 'rose', label: 'not listed on Solana' },
  'not-ingested': { tone: 'slate', label: 'not ingested yet' },
};

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function RwaChart({ r }: { r: RwaBacktestResult }) {
  const base = r.config.capitalUsd;
  const data = r.curve.map((p) => ({
    date: p.date,
    Strategy: +((p.equity / base) * 100).toFixed(2),
    'EW basket': p.ew != null ? +((p.ew / base) * 100).toFixed(2) : null,
    [r.config.priceSource === 'token' ? 'SPYx' : 'SPY']: p.spy != null ? +((p.spy / base) * 100).toFixed(2) : null,
  }));
  const spyKey = r.config.priceSource === 'token' ? 'SPYx' : 'SPY';
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
        <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="Strategy" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="EW basket" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        <Line type="monotone" dataKey={spyKey} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PremiumChart({ r }: { r: RwaBacktestResult }) {
  const syms = Object.keys(r.premiumSeries).filter((s) => r.premiumSeries[s].length > 0).slice(0, 4);
  if (!syms.length) return <div className="text-xs text-slate-500">No overlapping token/stock prices to compute premium.</div>;
  const dates = [...new Set(syms.flatMap((s) => r.premiumSeries[s].map((p) => p.date)))].sort();
  const lookup = Object.fromEntries(syms.map((s) => [s, Object.fromEntries(r.premiumSeries[s].map((p) => [p.date, p.premium]))]));
  const data = dates.map((d) => ({ date: d, ...Object.fromEntries(syms.map((s) => [s, lookup[s][d] != null ? +(lookup[s][d] * 100).toFixed(2) : null])) }));
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#c084fc'];
  const dashes = ['', '5 4', '2 3', '8 3 2 3'];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} minTickGap={40} />
        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', fontSize: 11 }} formatter={(v) => (typeof v === 'number' ? `${v.toFixed(2)}%` : String(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#475569" />
        {syms.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} stroke={colors[i]} strokeDasharray={dashes[i]} strokeWidth={1.5} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RwaBacktestView() {
  const [cfg, setCfg] = useState<RwaBacktestConfig>(DEFAULT_RWA_CONFIG);
  const deferred = useDeferredValue(cfg);
  const { result, error } = useMemo(() => {
    try {
      return { result: runRwaBacktest(RWA_UNIVERSE, RWA_BENCHMARKS, COMPANY_BY_TICKER, deferred), error: null as string | null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [deferred]);
  const set = <K extends keyof RwaBacktestConfig>(k: K, v: RwaBacktestConfig[K]) => setCfg({ ...cfg, [k]: v });
  const num = (v: string, f: number) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : f);
  const token = cfg.priceSource === 'token';

  return (
    <div className="space-y-3">
      <Card title="Tokenized-equity data status" icon={<Database size={14} className="text-purple-400" />}>
        {ON_CHAIN === 0 && (
          <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-100/90">
            <div className="mb-1 flex items-center gap-1 font-semibold text-amber-200">
              <AlertTriangle size={12} /> No on-chain token prices ingested yet
            </div>
            DexScreener / GeckoTerminal are unreachable from the environment this build was made in, so no token bars are bundled. Run once on a machine
            with internet access, then rebuild:
            <div className="mt-1 font-mono text-slate-300">
              <Terminal size={11} className="mr-1 inline" />
              npm run ingest:rwa
            </div>
            Until then only the <b>stock-price comparison</b> is available (listed-share daily closes over the token era — clearly not token results).
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-800">
              <tr>
                {['Token', 'Underlying', 'Listing evidence', 'On-chain status', 'Mint', 'Token days', 'Token range', 'Underlying daily', 'Last liquidity'].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...RWA_UNIVERSE, ...RWA_BENCHMARKS].map((e) => {
                const c = COMPANY_BY_TICKER[e.underlying];
                const st = STATUS_UI[e.status];
                const ud = e.underlyingDaily ? Object.keys(e.underlyingDaily.closes).sort() : [];
                return (
                  <tr key={e.symbol} className="border-b border-slate-800/60">
                    <td className="td"><Badge tone="purple">⚡ {e.symbol}</Badge></td>
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        {c && <CompanyLogo meta={c} size={18} />}
                        <span className="font-semibold">{e.underlying}</span>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={e.evidence === 'public-source' ? 'blue' : 'slate'} title={e.evidence === 'public-source' ? 'Named in public xStocks coverage' : 'No public confirmation found at build time'}>
                        {e.evidence === 'public-source' ? 'public source' : 'unverified'}
                      </Badge>
                    </td>
                    <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="td num text-[10px] text-slate-400" title={e.ingested?.mint}>
                      {e.ingested?.mint ? `${e.ingested.mint.slice(0, 6)}…${e.ingested.mint.slice(-6)}` : '—'}
                    </td>
                    <td className="td num text-right">{e.tokenDays || '—'}</td>
                    <td className="td num text-[11px] text-slate-400">{e.firstTokenDay ? `${e.firstTokenDay} → ${e.lastTokenDay}` : '—'}</td>
                    <td className="td num text-[11px] text-slate-400">{ud.length ? `${ud.length}d · to ${ud[ud.length - 1]}` : <span className="text-slate-600">none</span>}</td>
                    <td className="td num text-right">{e.ingested?.liquidityUsd != null ? `$${fmtNum(e.ingested.liquidityUsd, 0)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Card title="RWA backtest parameters" icon={<Coins size={14} className="text-purple-400" />}>
          <span className="label">Price source</span>
          <div className="mb-3 flex gap-1">
            <button
              disabled={ON_CHAIN === 0}
              onClick={() => set('priceSource', 'token')}
              className={`flex-1 rounded border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${token ? 'border-purple-500/60 bg-purple-500/10 text-purple-200' : 'border-slate-700 text-slate-400'}`}
            >
              On-chain token prices
            </button>
            <button
              onClick={() => set('priceSource', 'underlying')}
              className={`flex-1 rounded border px-2 py-1 text-[11px] ${!token ? 'border-amber-500/60 bg-amber-500/10 text-amber-200' : 'border-slate-700 text-slate-400'}`}
            >
              Stock-price comparison
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <F label="Start">
              <input className="input num" type="date" min={RWA_PROGRAM_LAUNCH} value={cfg.startDate} onChange={(e) => set('startDate', e.target.value || RWA_PROGRAM_LAUNCH)} />
            </F>
            <F label="End">
              <input className="input num" type="date" value={cfg.endDate} onChange={(e) => set('endDate', e.target.value || '2026-12-31')} />
            </F>
            <F label="Rebalance">
              <select className="input" value={cfg.rebalance} onChange={(e) => set('rebalance', e.target.value as RwaBacktestConfig['rebalance'])}>
                <option value="weekly">Weekly (exits checked daily)</option>
                <option value="daily">Daily</option>
              </select>
            </F>
            <F label="Capital (USD)">
              <input className="input num" type="number" min={1000} step={10000} value={cfg.capitalUsd} onChange={(e) => set('capitalUsd', num(e.target.value, 100000))} />
            </F>
            <F label={`Max positions: ${cfg.maxPositions}`}>
              <input type="range" min={1} max={10} value={cfg.maxPositions} onChange={(e) => set('maxPositions', Number(e.target.value))} className="w-full accent-purple-500" />
            </F>
            <F label={`Leverage: ${cfg.leverage.toFixed(1)}x`}>
              <input type="range" min={1} max={3} step={0.1} value={cfg.leverage} onChange={(e) => set('leverage', Number(e.target.value))} className="w-full accent-purple-500" />
            </F>
            <F label="Sizing">
              <select className="input" value={cfg.sizing} onChange={(e) => set('sizing', e.target.value as RwaBacktestConfig['sizing'])}>
                <option value="equal">Equal Weight</option>
                <option value="score">Score Weighted</option>
                <option value="risk">Equal Risk (1/σ)</option>
              </select>
            </F>
            <F label="Benchmark">
              <select className="input" value={cfg.benchmark} onChange={(e) => set('benchmark', e.target.value as RwaBacktestConfig['benchmark'])}>
                <option value="EW">Equal-weight basket</option>
                <option value="SPY">{token ? 'SPYx' : 'SPY'}</option>
              </select>
            </F>
          </div>
          {token ? (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-purple-500/20 bg-purple-500/5 p-2">
              <F label="DEX fee (bps)"><input className="input num" type="number" min={0} value={cfg.dexFeeBps} onChange={(e) => set('dexFeeBps', num(e.target.value, 0))} /></F>
              <F label="Base slippage (bps)"><input className="input num" type="number" min={0} value={cfg.baseSlippageBps} onChange={(e) => set('baseSlippageBps', num(e.target.value, 0))} /></F>
              <F label="Impact @100% ADV (bps)"><input className="input num" type="number" min={0} value={cfg.impactBpsAtFullVolume} onChange={(e) => set('impactBpsAtFullVolume', num(e.target.value, 0))} /></F>
              <F label="Max % of 20d volume"><input className="input num" type="number" min={1} max={100} value={Math.round(cfg.maxParticipation * 100)} onChange={(e) => set('maxParticipation', num(e.target.value, 10) / 100)} /></F>
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-300">
                <input type="checkbox" className="accent-purple-500" checked={cfg.maxEntryPremium != null} onChange={(e) => set('maxEntryPremium', e.target.checked ? 0.02 : null)} />
                Skip entry if token premium &gt;
                <input className="input num w-14" type="number" step={0.5} disabled={cfg.maxEntryPremium == null} value={cfg.maxEntryPremium != null ? +(cfg.maxEntryPremium * 100).toFixed(1) : ''} onChange={(e) => set('maxEntryPremium', num(e.target.value, 2) / 100)} />%
              </label>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <F label="Broker fee (bps)"><input className="input num" type="number" min={0} value={cfg.equityFeeBps} onChange={(e) => set('equityFeeBps', num(e.target.value, 0))} /></F>
              <F label="Slippage (bps)"><input className="input num" type="number" min={0} value={cfg.equitySlippageBps} onChange={(e) => set('equitySlippageBps', num(e.target.value, 0))} /></F>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <F label={`Min composite: ${cfg.minScore}`}>
              <input type="range" min={0} max={90} value={cfg.minScore} onChange={(e) => set('minScore', Number(e.target.value))} className="w-full accent-emerald-500" />
            </F>
            <F label={`Max entry norm P/E: ${cfg.maxEntryNormPe}x`}>
              <input type="range" min={4} max={80} value={cfg.maxEntryNormPe} onChange={(e) => set('maxEntryNormPe', Number(e.target.value))} className="w-full accent-emerald-500" />
            </F>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {CYCLE_STATES.map((s) => (
              <button
                key={s}
                onClick={() => set('entryStates', cfg.entryStates.includes(s) ? cfg.entryStates.filter((x) => x !== s) : [...cfg.entryStates, s])}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${cfg.entryStates.includes(s) ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-500'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            <F label={`Max holding: ${cfg.maxHoldingDays} days`}>
              <input type="range" min={7} max={365} value={cfg.maxHoldingDays} onChange={(e) => set('maxHoldingDays', Number(e.target.value))} className="w-full accent-emerald-500" />
            </F>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-500" checked={cfg.targetNormPe != null} onChange={(e) => set('targetNormPe', e.target.checked ? 40 : null)} />
              Target exit at norm P/E ≥
              <input className="input num w-14" type="number" disabled={cfg.targetNormPe == null} value={cfg.targetNormPe ?? ''} onChange={(e) => set('targetNormPe', num(e.target.value, 40))} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-500" checked={cfg.cyclePeakExit} onChange={(e) => set('cyclePeakExit', e.target.checked)} />
              Cycle Peak exit
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-emerald-500" checked={cfg.trailingStop != null} onChange={(e) => set('trailingStop', e.target.checked ? 0.2 : null)} />
              Trailing stop
              <input className="input num w-14" type="number" disabled={cfg.trailingStop == null} value={cfg.trailingStop != null ? Math.round(cfg.trailingStop * 100) : ''} onChange={(e) => set('trailingStop', num(e.target.value, 20) / 100)} />%
            </label>
          </div>
        </Card>

        <div className="space-y-3">
          {!token && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-semibold text-amber-200">
              STOCK-PRICE COMPARISON — listed-share daily closes, NOT tokenized-equity prices.
            </div>
          )}
          <KpiCards m={result?.metrics ?? null} benchmark={cfg.benchmark === 'SPY' ? (token ? 'SPYx' : 'SPY') : 'EW basket'} />
          <Card
            title={token ? 'Equity — on-chain token prices' : 'Equity — stock-price comparison'}
            icon={<LineIcon size={14} className="text-emerald-400" />}
            right={result && <span className="text-[10px] text-slate-500">tradeable: {result.tradeable.join(', ')} · costs ${fmtNum(result.totalCostsUsd, 0)}</span>}
          >
            {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</div>}
            {result && <RwaChart r={result} />}
          </Card>
          {result && token && (
            <Card title="Token premium / discount vs listed share (last close)">
              <PremiumChart r={result} />
            </Card>
          )}
          {result && (result.warnings.length > 0 || result.excluded.length > 0) && (
            <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
              {result.warnings.map((w) => (
                <div key={w} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>
              ))}
              {result.excluded.length > 0 && (
                <div className="text-slate-400">Excluded: {result.excluded.map((x) => `${x.symbol} (${x.reason})`).join(' · ')}</div>
              )}
            </div>
          )}
          {result && (
            <Card title={`Trades (${result.trades.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-800">
                    <tr>
                      {['#', 'Token', 'Entry', 'Exit', 'Entry px', 'Exit px', 'Return', 'Days', 'State in→out', 'Norm P/E in→out', ...(token ? ['Prem. in→out', 'Cost bps in/out', '% ADV', 'Days to fill'] : []), 'Reason'].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t) => (
                      <tr key={t.id} className="border-b border-slate-800/60">
                        <td className="td num text-slate-500">{t.id}</td>
                        <td className="td font-semibold">{token ? t.symbol : t.ticker}</td>
                        <td className="td num">{t.entryDate}</td>
                        <td className="td num">{t.exitDate}</td>
                        <td className="td num text-right">${fmtNum(t.entryPrice, 2)}</td>
                        <td className="td num text-right">${fmtNum(t.exitPrice, 2)}</td>
                        <td className={`td num text-right font-semibold ${t.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedPct(t.returnPct)}</td>
                        <td className="td num text-right">{Math.round(t.holdingDays)}</td>
                        <td className="td"><div className="flex items-center gap-1"><StateBadge state={t.entryState} />→<StateBadge state={t.exitState} /></div></td>
                        <td className="td num">{t.entryNormPe?.toFixed(1) ?? 'N/A'} → {t.exitNormPe?.toFixed(1) ?? 'N/A'}</td>
                        {token && (
                          <>
                            <td className="td num">{fmtSignedPct(t.entryPremium, 2)} → {fmtSignedPct(t.exitPremium, 2)}</td>
                            <td className="td num">{t.entryCostBps.toFixed(0)} / {t.exitCostBps.toFixed(0)}</td>
                            <td className="td num">{fmtPct(t.entryParticipation)}</td>
                            <td className="td num text-right">{Math.round(t.exitDaysToFill)}</td>
                          </>
                        )}
                        <td className="td text-[11px] text-slate-400">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
