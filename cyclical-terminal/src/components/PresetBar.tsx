import { Zap } from 'lucide-react';
import { PRESETS, type Preset } from '../engine/presets';

export function PresetBar({ active, onSelect }: { active: string | null; onSelect: (p: Preset) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <div className="flex shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={12} className="text-amber-400" /> One-click
      </div>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          title={p.description}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-left transition ${
            active === p.id
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="text-xs font-semibold">
            {p.emoji} {p.nameKo}
          </div>
          <div className="text-[10px] text-slate-500">{p.name}</div>
        </button>
      ))}
    </div>
  );
}
