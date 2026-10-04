import type { ReactNode } from 'react';
import type { CycleState } from '../types';

export function Card({ title, icon, right, children, className = '' }: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-900/60 ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            {icon}
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

type Tone = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'slate' | 'cyan';

const TONE: Record<Tone, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  slate: 'border-slate-600/40 bg-slate-700/30 text-slate-300',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
};

export function Badge({ tone = 'slate', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const STATE_TONE: Record<CycleState, Tone> = {
  'Structural Growth': 'purple',
  'Early Downturn': 'amber',
  'Late Downturn': 'rose',
  Bottoming: 'emerald',
  'Early Recovery': 'emerald',
  'Mid Recovery': 'blue',
  'Late Cycle': 'amber',
  Peak: 'rose',
};

export function StateBadge({ state }: { state: CycleState }) {
  return <Badge tone={STATE_TONE[state]}>{state}</Badge>;
}

export function ScoreBar({ value, tone = 'emerald' }: { value: number; tone?: 'emerald' | 'blue' | 'purple' | 'amber' }) {
  const color = { emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500', amber: 'bg-amber-500' }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="num w-7 text-right text-[11px] text-slate-300">{value.toFixed(0)}</span>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
            value === it.id ? 'bg-slate-800 text-emerald-300 shadow-inner' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`mt-8 w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} rounded-lg border border-slate-700 bg-slate-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
