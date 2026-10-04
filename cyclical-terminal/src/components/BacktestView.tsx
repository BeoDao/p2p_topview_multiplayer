import { AlertTriangle, Download, LineChart as LineIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { BacktestConfig, BacktestResult } from '../engine/backtest';
import { BacktestConfigPanel } from './BacktestConfigPanel';
import { DrawdownChart, EquityChart } from './EquityChart';
import { ExportCard } from './ExportCard';
import { Card } from './ui';

export function BacktestView({ config, onChange, result, error, dataEnd, presetName }: {
  config: BacktestConfig;
  onChange: (c: BacktestConfig) => void;
  result: BacktestResult | null;
  error: string | null;
  dataEnd: string;
  presetName: string;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportPng = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const url = await toPng(exportRef.current, { pixelRatio: 2, backgroundColor: '#020617', cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = `cyclical-backtest-${config.universe}-${config.startDate.slice(0, 4)}-${config.endDate.slice(0, 4)}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <BacktestConfigPanel config={config} onChange={onChange} dataEnd={dataEnd} />
      <div className="space-y-3">
        <Card
          title="Equity Curve (indexed = 100)"
          icon={<LineIcon size={14} className="text-emerald-400" />}
          right={
            <button
              onClick={exportPng}
              disabled={!result || exporting}
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-40"
            >
              <Download size={12} /> {exporting ? 'Rendering…' : 'Export infographic PNG'}
            </button>
          }
        >
          {error && (
            <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {result && (
            <>
              <EquityChart curve={result.curve} benchmark={config.benchmark} />
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Drawdown</div>
              <DrawdownChart curve={result.curve} />
            </>
          )}
        </Card>
        {result && result.warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
            {result.warnings.map((w) => (
              <div key={w} className="flex items-start gap-2 text-[11px] text-amber-200/90">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
              </div>
            ))}
          </div>
        )}
        {result && (
          <div className="pointer-events-none fixed -left-[2000px] top-0" aria-hidden>
            <div ref={exportRef}>
              <ExportCard result={result} presetName={presetName} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
