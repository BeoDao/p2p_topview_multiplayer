import { Activity, Calculator, Factory, FileText, HeartPulse } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Company } from '../data';
import type { Snapshot } from '../engine/snapshot';
import { FACTOR_LABELS, type FactorKey } from '../engine/scoring';
import { quarterLabel } from '../lib/dates';
import { fmtMoney, fmtMultiple, fmtNum, fmtPct, fmtPrice, fmtSignedPct, UNIT_LABEL } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { FlagBadge } from './Screener';
import { Badge, ScoreBar, StateBadge } from './ui';

function AltmanGauge({ z }: { z: number | null }) {
  // Semicircle 0 → 5; distress < 1.81 < grey < 2.99 < safe.
  const clampZ = z == null ? 0 : Math.max(0, Math.min(5, z));
  const angle = Math.PI * (1 - clampZ / 5);
  const r = 52;
  const cx = 64;
  const cy = 62;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 5);
    const a1 = Math.PI * (1 - to / 5);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  return (
    <svg viewBox="0 0 128 76" className="w-40" role="img" aria-label={`Altman Z ${z?.toFixed(2) ?? 'n/a'}`}>
      <path d={arc(0, 1.81)} stroke="#f43f5e" strokeWidth="9" fill="none" />
      <path d={arc(1.81, 2.99)} stroke="#f59e0b" strokeWidth="9" fill="none" />
      <path d={arc(2.99, 5)} stroke="#10b981" strokeWidth="9" fill="none" />
      {z != null && (
        <line x1={cx} y1={cy} x2={cx + (r - 4) * Math.cos(angle)} y2={cy - (r - 4) * Math.sin(angle)} stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
      )}
      <circle cx={cx} cy={cy} r="3.5" fill="#e2e8f0" />
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontFamily="JetBrains Mono, monospace">
        {z == null ? 'n/a' : z.toFixed(2)}
      </text>
    </svg>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export function CompanyDetail({ company: c, snap: s, history }: { company: Company; snap: Snapshot; history: Snapshot[] }) {
  const ne = s.ne;
  const latest = s.latest;
  const ccy = c.priceCurrency;
  const histData = history
    .filter((h) => h.price)
    .map((h) => ({
      date: quarterLabel(h.asOf),
      'Normalized P/E': h.ne.normalizedPe != null ? +Math.min(h.ne.normalizedPe, 80).toFixed(1) : null,
      'Trailing P/E': h.ne.trailingPe != null ? +Math.min(h.ne.trailingPe, 80).toFixed(1) : null,
    }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyLogo meta={c} size={44} />
        <div className="flex-1">
          <div className="text-lg font-semibold text-white">
            {c.name} {c.nameLocal && <span className="text-sm text-slate-400">{c.nameLocal}</span>}
          </div>
          <div className="text-xs text-slate-400">
            {c.exchange}:{c.ticker} · {c.sector} · {c.regulator} {c.regulator === 'SEC' ? 'CIK' : c.regulator === 'DART' ? '고유번호' : 'EDINET'} {c.regulatorId} · FYE {c.fiscalYearEnd}
          </div>
          <div className="mt-1 text-xs text-slate-500">{c.thesis}</div>
          {c.operatingIncomeBasis === 'pretax' && (
            <div className="mt-1 text-[10px] text-amber-300/80">
              No operating-income line in filings: operating income shown = pre-tax income + interest expense (EBIT-equivalent).
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="num text-xl font-semibold text-white">{s.price ? fmtPrice(s.price.price, ccy) : '—'}</div>
          <div className="text-[10px] text-slate-500">close {s.price?.date ?? 'n/a'} · as of {s.asOf}</div>
          <div className="mt-1 flex justify-end gap-1">
            <StateBadge state={s.state} />
            <FlagBadge flag={ne.flag} reason={ne.flagReason} />
          </div>
        </div>
      </div>

      <div className={`rounded border p-2 text-xs ${ne.flag === 'PEAK_TRAP' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : ne.flag === 'TROUGH_BUY' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-800/40 text-slate-300'}`}>
        {ne.flagReason}
      </div>

      <Section title="Normalized EPS — 4-method decomposition" icon={<Calculator size={13} className="text-emerald-400" />}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="th">Method</th>
              <th className="th text-right">Norm. margin</th>
              <th className="th text-right">Norm. EPS ({ccy})</th>
              <th className="th text-right">Implied P/E</th>
              <th className="th">Inputs (point-in-time)</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(ne.methods).map((m) => (
              <tr key={m.key} className="border-b border-slate-800/50">
                <td className="td"><span className="mr-1 rounded bg-slate-800 px-1 text-[10px] text-emerald-300">{m.key}</span>{m.label}</td>
                <td className="td num text-right">{fmtPct(m.margin)}</td>
                <td className="td num text-right">{m.eps == null ? <span className="text-rose-400">loss / n.a.</span> : fmtNum(m.eps, 2)}</td>
                <td className="td num text-right">{m.eps != null && s.price ? fmtMultiple(s.price.price / m.eps) : '—'}</td>
                <td className="td whitespace-normal text-[10px] text-slate-500">{m.detail}</td>
              </tr>
            ))}
            <tr className="bg-slate-800/30 font-semibold">
              <td className="td">Composite (median)</td>
              <td className="td num text-right">{fmtPct(ne.normalizedMargin)}</td>
              <td className="td num text-right text-emerald-300">{fmtNum(ne.compositeEps, 2)}</td>
              <td className="td num text-right text-emerald-300">{fmtMultiple(ne.normalizedPe)}</td>
              <td className="td text-[10px] font-normal text-slate-500">
                Trailing EPS {fmtNum(ne.trailingEps, 2)} → trailing P/E {ne.trailingPe == null ? 'N/A' : fmtMultiple(ne.trailingPe)} · tax {fmtPct(ne.taxRate, 1)}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <div className="grid gap-3 md:grid-cols-3">
        <Section title="Financial health" icon={<HeartPulse size={13} className="text-rose-400" />}>
          {s.score ? (
            <div className="flex flex-col items-center">
              <AltmanGauge z={s.score.health.altmanZ} />
              <Badge tone={s.score.health.zone === 'Safe' ? 'emerald' : s.score.health.zone === 'Grey' ? 'amber' : 'rose'}>Altman Z · {s.score.health.zone}</Badge>
              <dl className="mt-2 grid w-full grid-cols-2 gap-1 text-[11px]">
                <dt className="text-slate-500">Net debt / EBITDA</dt>
                <dd className="num text-right">{s.score.health.netDebtToEbitda == null ? 'n/m' : `${s.score.health.netDebtToEbitda.toFixed(2)}x`}</dd>
                <dt className="text-slate-500">Interest coverage</dt>
                <dd className="num text-right">{s.score.health.interestCoverage == null ? '∞' : `${s.score.health.interestCoverage.toFixed(1)}x`}</dd>
                <dt className="text-slate-500">Cash / assets</dt>
                <dd className="num text-right">{fmtPct(s.score.health.cashToAssets)}</dd>
              </dl>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No filing known yet.</div>
          )}
        </Section>

        <Section title="Operating leverage scenarios" icon={<Factory size={13} className="text-amber-400" />}>
          {s.score ? (
            <div className="space-y-2 text-[11px]">
              <div className="grid grid-cols-2 gap-1">
                <span className="text-slate-500">D&amp;A / revenue (fixed-cost proxy)</span>
                <span className="num text-right">{fmtPct(s.score.leverage.fixedCostIntensity)}</span>
                <span className="text-slate-500">Margin gap to normalized</span>
                <span className="num text-right">{s.score.leverage.marginGap == null ? '—' : `${(s.score.leverage.marginGap * 100).toFixed(1)}pp`}</span>
                <span className="text-slate-500">Median historical DOL</span>
                <span className="num text-right">{s.score.leverage.dol == null ? '—' : `${s.score.leverage.dol.toFixed(1)}x`}</span>
                <span className="text-slate-500">EBIT uplift if margin normalizes</span>
                <span className="num text-right text-emerald-300">{fmtSignedPct(s.score.leverage.ebitUpliftToNormal, 0)}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Revenue Δ</th>
                    <th className="th text-right">EBIT Δ (DOL)</th>
                  </tr>
                </thead>
                <tbody>
                  {s.score.leverage.scenarios.map((sc) => (
                    <tr key={sc.revenueChange} className="border-t border-slate-800/60">
                      <td className="td num">{fmtSignedPct(sc.revenueChange, 0)}</td>
                      <td className={`td num text-right ${sc.ebitChange != null && sc.ebitChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtSignedPct(sc.ebitChange, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-slate-500">—</div>
          )}
        </Section>

        <Section title="Cycle classifier evidence" icon={<Activity size={13} className="text-purple-400" />}>
          <ul className="space-y-1 text-[11px] text-slate-300">
            {s.cycle.evidence.map((e) => (
              <li key={e} className="flex gap-1">
                <span className="text-slate-600">›</span>
                {e}
              </li>
            ))}
          </ul>
          {s.score && (
            <div className="mt-2 space-y-1">
              {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((k) => (
                <div key={k} className="flex items-center justify-between text-[11px] text-slate-400">
                  {FACTOR_LABELS[k]}
                  <ScoreBar value={s.score!.factors[k]} tone="blue" />
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-800 pt-1 text-[11px] font-semibold text-slate-200">
                Composite
                <ScoreBar value={s.score.composite} />
              </div>
            </div>
          )}
        </Section>
      </div>

      <Section title="Trailing vs normalized P/E (point-in-time history, capped at 80x)" icon={<Activity size={13} className="text-blue-400" />}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={histData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={quarterLabel(s.asOf)} stroke="#64748b" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="Normalized P/E" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="Trailing P/E" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="text-[10px] text-slate-500">Gaps in the trailing line are loss years (P/E undefined).</div>
      </Section>

      <Section title={`Filings visible at ${s.asOf} (${UNIT_LABEL[c.unit]}, shares mn)`} icon={<FileText size={13} className="text-slate-400" />}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {['FY', 'Period end', 'Filed', 'Form', 'Revenue', 'Op. income', 'Margin', 'Net income', 'Net debt', 'Equity', 'Shares'].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...s.filings].reverse().map((f) => (
                <tr key={f.periodEnd} className="border-b border-slate-800/50">
                  <td className="td">FY{f.fiscalYear}</td>
                  <td className="td num">{f.periodEnd}</td>
                  <td className="td num text-emerald-300/80">{f.filingDate}</td>
                  <td className="td text-[10px]">{f.form}</td>
                  <td className="td num text-right">{fmtMoney(f.revenue)}</td>
                  <td className={`td num text-right ${f.operatingIncome < 0 ? 'text-rose-400' : ''}`}>{fmtMoney(f.operatingIncome)}</td>
                  <td className="td num text-right">{fmtPct(f.revenue ? f.operatingIncome / f.revenue : null)}</td>
                  <td className={`td num text-right ${f.netIncome < 0 ? 'text-rose-400' : ''}`}>{fmtMoney(f.netIncome)}</td>
                  <td className="td num text-right">{fmtMoney(f.totalDebt - f.cash)}</td>
                  <td className="td num text-right">{fmtMoney(f.totalEquity)}</td>
                  <td className="td num text-right">{fmtNum(f.sharesDiluted, 0)}</td>
                </tr>
              ))}
              {s.embargoed.map((f) => (
                <tr key={f.periodEnd} className="border-b border-slate-800/50 text-slate-600">
                  <td className="td">FY{f.fiscalYear}</td>
                  <td className="td num">{f.periodEnd}</td>
                  <td className="td num text-amber-500/80" colSpan={9}>
                    🔒 Embargoed — closed but not published until {f.filingDate}. Invisible to the engine on {s.asOf}.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {latest == null && <div className="text-xs text-slate-500">No annual report published yet at this date.</div>}
      </Section>
    </div>
  );
}
