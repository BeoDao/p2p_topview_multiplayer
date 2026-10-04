import { CheckCircle2, CircleDashed, History, XCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Company } from '../data';
import type { Trade } from '../engine/backtest';
import { quarterLabel } from '../lib/dates';
import { fmtMultiple, fmtPrice, fmtSignedPct } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { Badge, Card, StateBadge } from './ui';

const VERDICT_UI = {
  'Operating leverage confirmed': { tone: 'emerald' as const, icon: <CheckCircle2 size={11} /> },
  'Multiple re-rating only': { tone: 'amber' as const, icon: <Sparkles size={11} /> },
  'Thesis failed': { tone: 'rose' as const, icon: <XCircle size={11} /> },
  'Not yet testable': { tone: 'slate' as const, icon: <CircleDashed size={11} /> },
};

export function TradeExplorer({ trades, companies }: { trades: Trade[]; companies: Record<string, Company> }) {
  const [open, setOpen] = useState<number | null>(null);
  const verdictCounts = Object.keys(VERDICT_UI).map((v) => [v, trades.filter((t) => t.thesis.verdict === v).length] as const);

  return (
    <Card
      title={`Historical Trade Explorer & Thesis Validation (${trades.length})`}
      icon={<History size={14} className="text-purple-400" />}
      right={
        <div className="flex flex-wrap gap-1">
          {verdictCounts.map(([v, n]) => (
            <Badge key={v} tone={VERDICT_UI[v as keyof typeof VERDICT_UI].tone}>
              {v}: {n}
            </Badge>
          ))}
        </div>
      }
    >
      {trades.length === 0 ? (
        <div className="text-xs text-slate-500">No closed trades — loosen entry rules or widen the universe.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-800">
              <tr>
                {['#', 'Company', 'Entry', 'Exit', 'Entry px', 'Exit px', 'Return (USD)', 'Hold', 'Entry state → exit', 'Norm P/E in→out', 'Exit reason', 'Why did it move?'].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const c = companies[t.ticker];
                const v = VERDICT_UI[t.thesis.verdict];
                return (
                  <FragmentRow key={t.id} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} trade={t}>
                    <td className="td num text-slate-500">{t.id}</td>
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <CompanyLogo meta={c} size={20} />
                        <span className="font-semibold text-slate-100">{t.ticker}</span>
                        {t.syntheticRwa && <Badge tone="purple" title="Pre-launch synthetic RWA proxy">synthetic</Badge>}
                      </div>
                    </td>
                    <td className="td num">{quarterLabel(t.entry.date)}</td>
                    <td className="td num">{quarterLabel(t.exit.date)}</td>
                    <td className="td num text-right">{fmtPrice(t.entry.priceLocal, c.priceCurrency)}</td>
                    <td className="td num text-right">{fmtPrice(t.exit.priceLocal, c.priceCurrency)}</td>
                    <td className={`td num text-right font-semibold ${t.returnUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedPct(t.returnUsd)}</td>
                    <td className="td num text-right">{Math.round(t.holdingDays)}d</td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <StateBadge state={t.entry.state} />→<StateBadge state={t.exit.state} />
                      </div>
                    </td>
                    <td className="td num">{fmtMultiple(t.entry.normalizedPe)} → {fmtMultiple(t.exit.normalizedPe)}</td>
                    <td className="td text-[11px] text-slate-400">{t.reason}</td>
                    <td className="td"><Badge tone={v.tone}>{v.icon}{t.thesis.verdict}</Badge></td>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FragmentRow({ children, open, onToggle, trade: t }: { children: React.ReactNode; open: boolean; onToggle: () => void; trade: Trade }) {
  const th = t.thesis;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40">
        {children}
      </tr>
      {open && (
        <tr className="border-b border-slate-800 bg-slate-950/60">
          <td colSpan={12} className="px-4 py-3">
            <div className="grid gap-3 text-[11px] md:grid-cols-[1fr_2fr]">
              <div className="grid grid-cols-2 gap-1">
                <span className="text-slate-500">Fiscal year at entry → exit</span>
                <span className="num text-right">FY{t.entry.fiscalYear ?? '—'} → FY{t.exit.fiscalYear ?? '—'}</span>
                <span className="text-slate-500">Revenue Δ</span>
                <span className="num text-right">{fmtSignedPct(th.revenueChange)}</span>
                <span className="text-slate-500">Operating income Δ</span>
                <span className="num text-right">{fmtSignedPct(th.ebitChange)}</span>
                <span className="text-slate-500">Op. margin Δ</span>
                <span className="num text-right">{th.marginChangePp == null ? '—' : `${th.marginChangePp >= 0 ? '+' : ''}${th.marginChangePp.toFixed(1)}pp`}</span>
                <span className="text-slate-500">Normalized EPS Δ</span>
                <span className="num text-right">{fmtSignedPct(th.normalizedEpsChange)}</span>
                <span className="text-slate-500">Normalized P/E Δ (re-rating)</span>
                <span className="num text-right">{fmtSignedPct(th.multipleChange)}</span>
                <span className="text-slate-500">Trailing P/E in → out</span>
                <span className="num text-right">{fmtMultiple(t.entry.trailingPe)} → {fmtMultiple(t.exit.trailingPe)}</span>
                <span className="text-slate-500">Composite score at entry</span>
                <span className="num text-right">{t.entry.composite.toFixed(0)}</span>
                <span className="text-slate-500">Round-trip cost</span>
                <span className="num text-right">{(t.costBps * 2).toFixed(0)} bps</span>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Post-mortem: why did it move?</div>
                <p className="leading-relaxed text-slate-300">{th.narrative}</p>
                <p className="mt-2 text-[10px] text-slate-500">
                  Operating leverage is judged “confirmed” when, between the last annual report known at entry and the last known at exit, operating income grew
                  &gt;1.5× faster than revenue or operating margin expanded ≥3pp. Only filings public on each date are used.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
