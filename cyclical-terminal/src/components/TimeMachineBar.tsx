import { Clock, Lock } from 'lucide-react';
import { quarterEnds, quarterLabel } from '../lib/dates';

const ALL_DATES = quarterEnds(2018, 2026);

export function TimeMachineBar({ asOf, onChange, dataEnd }: { asOf: string; onChange: (d: string) => void; dataEnd: string }) {
  const idx = ALL_DATES.indexOf(asOf);
  const maxIdx = ALL_DATES.filter((d) => d <= dataEnd).length - 1;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <Clock size={14} className="text-blue-400" /> Time Machine · as of
          <span className="num rounded bg-blue-500/15 px-2 py-0.5 text-sm text-blue-200">{quarterLabel(asOf)}</span>
          <span className="num text-[11px] font-normal normal-case text-slate-500">({asOf})</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Lock size={11} /> Only filings published on/before this date and the close on this date are visible.
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={ALL_DATES.length - 1}
        value={idx < 0 ? maxIdx : idx}
        onChange={(e) => onChange(ALL_DATES[Math.min(Number(e.target.value), maxIdx)])}
        className="w-full accent-blue-500"
        aria-label="Point-in-time date"
      />
      <div className="mt-1 grid grid-cols-9 text-center text-[10px] text-slate-500">
        {Array.from({ length: 9 }, (_, i) => 2018 + i).map((y) => {
          const target = `${y}-12-31` <= dataEnd ? `${y}-12-31` : undefined;
          return (
            <button
              key={y}
              disabled={!target}
              onClick={() => target && onChange(target)}
              className={`num rounded py-0.5 ${asOf.startsWith(String(y)) ? 'text-blue-300' : 'hover:text-slate-200'} disabled:cursor-not-allowed disabled:text-slate-700`}
              title={target ? `Jump to ${y} Q4` : `${y}: no data bundled — run the ingestion scripts`}
            >
              {y}
            </button>
          );
        })}
      </div>
    </div>
  );
}
