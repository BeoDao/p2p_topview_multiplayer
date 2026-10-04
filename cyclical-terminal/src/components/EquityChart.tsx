import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EquityPoint } from '../engine/metrics';
import { quarterLabel } from '../lib/dates';

const STRATEGY = '#10b981';
const BENCH = '#3b82f6';
const AXIS = { fontSize: 10, fill: '#64748b' };

const tooltipStyle = {
  contentStyle: { background: '#020617', border: '1px solid #334155', borderRadius: 6, fontSize: 11 },
  labelStyle: { color: '#cbd5e1' },
  itemStyle: { color: '#e2e8f0' },
};

export function EquityChart({ curve, benchmark, height = 260, animate = true }: {
  curve: EquityPoint[];
  benchmark: string;
  height?: number;
  animate?: boolean;
}) {
  const data = curve.map((p) => ({
    date: quarterLabel(p.date),
    Strategy: +(p.equity / curve[0].equity * 100).toFixed(2),
    [benchmark]: p.benchmark != null ? +(p.benchmark / curve[0].equity * 100).toFixed(2) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v.toFixed(0)}`} domain={['auto', 'auto']} />
        <Tooltip {...tooltipStyle} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : String(v))} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
        <Line type="monotone" dataKey="Strategy" stroke={STRATEGY} strokeWidth={2} dot={false} isAnimationActive={animate} />
        <Line type="monotone" dataKey={benchmark} stroke={BENCH} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={animate} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ curve, height = 120 }: { curve: EquityPoint[]; height?: number }) {
  const data = curve.map((p) => ({ date: quarterLabel(p.date), Drawdown: +(p.drawdown * 100).toFixed(2) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
        <Tooltip {...tooltipStyle} formatter={(v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : String(v))} />
        <Area type="monotone" dataKey="Drawdown" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
