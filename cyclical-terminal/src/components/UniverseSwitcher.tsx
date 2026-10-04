import type { UniverseKey } from '../types';
import type { Company } from '../data';
import { universeFilter } from '../engine/backtest';

const ITEMS: { id: UniverseKey; label: string }[] = [
  { id: 'ALL', label: 'All 한·미·일' },
  { id: 'KR', label: '🇰🇷 K-Cyclicals' },
  { id: 'JP', label: '🇯🇵 J-Cyclicals' },
  { id: 'US', label: '🇺🇸 US/Global' },
  { id: 'RWA', label: '⚡ Solana RWA' },
];

export function UniverseSwitcher({ value, onChange, companies }: {
  value: UniverseKey;
  onChange: (u: UniverseKey) => void;
  companies: Company[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ITEMS.map((it) => {
        const n = companies.filter((c) => universeFilter(it.id, c)).length;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`rounded border px-2.5 py-1 text-xs transition ${
              value === it.id
                ? it.id === 'RWA'
                  ? 'border-purple-500/60 bg-purple-500/15 text-purple-200'
                  : 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                : 'border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {it.label} <span className="num text-[10px] text-slate-500">({n})</span>
          </button>
        );
      })}
    </div>
  );
}
