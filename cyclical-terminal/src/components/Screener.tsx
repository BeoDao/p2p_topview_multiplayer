import { AlertOctagon, ArrowUpDown, Search, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Company } from '../data';
import type { Snapshot } from '../engine/snapshot';
import { fmtMultiple, fmtPct, fmtPrice } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { Badge, Card, ScoreBar, StateBadge } from './ui';

type SortKey = 'composite' | 'normPe' | 'trailingPe' | 'ticker';

const FLAG_UI = {
  PEAK_TRAP: { tone: 'rose' as const, label: 'Peak trap', icon: <AlertOctagon size={10} /> },
  TROUGH_BUY: { tone: 'emerald' as const, label: 'Trough buy', icon: <TrendingDown size={10} /> },
  NEUTRAL: { tone: 'slate' as const, label: 'Neutral', icon: null },
  NO_DATA: { tone: 'slate' as const, label: 'No data', icon: null },
};

export function FlagBadge({ flag, reason }: { flag: Snapshot['ne']['flag']; reason?: string }) {
  const f = FLAG_UI[flag];
  return (
    <Badge tone={f.tone} title={reason}>
      {f.icon}
      {f.label}
    </Badge>
  );
}

export function Screener({ rows, onSelect }: { rows: { company: Company; snap: Snapshot }[]; onSelect: (t: string) => void }) {
  const [sort, setSort] = useState<SortKey>('composite');
  const [q, setQ] = useState('');
  const sorted = useMemo(() => {
    const filtered = rows.filter(
      ({ company }) =>
        !q ||
        company.ticker.toLowerCase().includes(q.toLowerCase()) ||
        company.name.toLowerCase().includes(q.toLowerCase()) ||
        (company.nameLocal ?? '').includes(q),
    );
    const val = (s: Snapshot): number => {
      switch (sort) {
        case 'composite':
          return -(s.score?.composite ?? -1);
        case 'normPe':
          return s.ne.normalizedPe ?? Infinity;
        case 'trailingPe':
          return s.ne.trailingPe ?? Infinity;
        default:
          return 0;
      }
    };
    return [...filtered].sort((a, b) =>
      sort === 'ticker' ? a.company.ticker.localeCompare(b.company.ticker) : val(a.snap) - val(b.snap),
    );
  }, [rows, sort, q]);

  const SortBtn = ({ k, children }: { k: SortKey; children: string }) => (
    <button onClick={() => setSort(k)} className={`inline-flex items-center gap-0.5 ${sort === k ? 'text-emerald-300' : ''}`}>
      {children}
      <ArrowUpDown size={9} />
    </button>
  );

  const counts = {
    trough: rows.filter((r) => r.snap.ne.flag === 'TROUGH_BUY').length,
    trap: rows.filter((r) => r.snap.ne.flag === 'PEAK_TRAP').length,
  };

  return (
    <Card
      title="Point-in-Time Cyclical Screener"
      icon={<Search size={14} className="text-blue-400" />}
      right={
        <div className="flex items-center gap-2">
          <Badge tone="emerald">{counts.trough} trough-buy</Badge>
          <Badge tone="rose">{counts.trap} peak-trap</Badge>
          <input className="input w-36" placeholder="Filter ticker / name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b border-slate-800">
            <tr>
              <th className="th"><SortBtn k="ticker">Company</SortBtn></th>
              <th className="th text-right">Price</th>
              <th className="th">Latest FY known</th>
              <th className="th text-right"><SortBtn k="trailingPe">Trail P/E</SortBtn></th>
              <th className="th text-right"><SortBtn k="normPe">Norm P/E</SortBtn></th>
              <th className="th">Signal</th>
              <th className="th">Cycle state</th>
              <th className="th text-right">Op. margin</th>
              <th className="th">Altman Z</th>
              <th className="th"><SortBtn k="composite">Composite</SortBtn></th>
              <th className="th">Val · Hlth · OpLev · Cat · Cyc</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ company: c, snap: s }) => (
              <tr key={c.ticker} onClick={() => onSelect(c.ticker)} className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <CompanyLogo meta={c} size={24} />
                    <div>
                      <div className="flex items-center gap-1 font-semibold text-slate-100">
                        {c.ticker}
                        {c.rwaSymbol && <Badge tone="purple">{c.rwaSymbol}</Badge>}
                      </div>
                      <div className="text-[10px] text-slate-500">{c.nameLocal ?? c.name}</div>
                    </div>
                  </div>
                </td>
                <td className="td num text-right">{s.price ? fmtPrice(s.price.price, c.priceCurrency) : <span className="text-slate-600">untraded</span>}</td>
                <td className="td text-[11px] text-slate-400">
                  {s.latest ? (
                    <>
                      FY{s.latest.fiscalYear} <span className="text-slate-600">· filed {s.latest.filingDate}</span>
                      {s.embargoed.length > 0 && (
                        <span className="ml-1 text-amber-400/80" title={`Embargoed: FY${s.embargoed.map((f) => f.fiscalYear).join(', ')} closed but not yet published`}>
                          +{s.embargoed.length} embargoed
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={`td num text-right ${s.ne.trailingPe == null ? 'text-rose-400' : ''}`}>{s.ne.trailingPe == null && s.latest ? 'N/A (loss)' : fmtMultiple(s.ne.trailingPe)}</td>
                <td className="td num text-right font-semibold text-slate-100">{fmtMultiple(s.ne.normalizedPe)}</td>
                <td className="td"><FlagBadge flag={s.ne.flag} reason={s.ne.flagReason} /></td>
                <td className="td"><StateBadge state={s.state} /></td>
                <td className="td num text-right">{fmtPct(s.ne.currentMargin)}</td>
                <td className="td">
                  {s.score ? (
                    <Badge tone={s.score.health.zone === 'Safe' ? 'emerald' : s.score.health.zone === 'Grey' ? 'amber' : s.score.health.zone === 'Distress' ? 'rose' : 'slate'}>
                      {s.score.health.altmanZ?.toFixed(2) ?? '—'} {s.score.health.zone}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td">{s.score ? <ScoreBar value={s.score.composite} /> : '—'}</td>
                <td className="td">
                  {s.score && (
                    <div className="flex gap-1">
                      {Object.values(s.score.factors).map((v, i) => (
                        <div key={i} className="flex h-4 w-2 flex-col justify-end overflow-hidden rounded-sm bg-slate-800" title={v.toFixed(0)}>
                          <div className="w-full bg-blue-500" style={{ height: `${v}%` }} />
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
