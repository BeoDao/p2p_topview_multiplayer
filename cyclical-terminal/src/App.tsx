import { BarChart3, Coins, Database, History, Search, ShieldCheck, Wallet } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { COMPANIES, COMPANY_BY_TICKER } from './data';
import { runBacktest, universeFilter, type BacktestConfig, type BacktestResult } from './engine/backtest';
import { priceAsOf } from './engine/pointInTime';
import { PRESETS, type Preset } from './engine/presets';
import { buildSnapshotStore } from './engine/snapshot';
import { quarterEnds } from './lib/dates';
import type { UniverseKey } from './types';
import { BacktestView } from './components/BacktestView';
import { CompanyDetail } from './components/CompanyDetail';
import { KpiCards } from './components/KpiCards';
import { PresetBar } from './components/PresetBar';
import { Provenance } from './components/Provenance';
import { RwaBacktestView } from './components/RwaBacktestView';
import { RwaPanel } from './components/RwaPanel';
import { Screener } from './components/Screener';
import { TimeMachineBar } from './components/TimeMachineBar';
import { TradeExplorer } from './components/TradeExplorer';
import { UniverseSwitcher } from './components/UniverseSwitcher';
import { Badge, Modal, Tabs } from './components/ui';

type Tab = 'backtest' | 'screener' | 'trades' | 'rwabt' | 'rwa' | 'provenance';

/** Last quarter-end covered by bundled/ingested prices. */
const DATA_END = COMPANIES.reduce((m, c) => {
  const last = Object.keys(c.data.prices).sort().at(-1) ?? '';
  return last > m ? last : m;
}, '');
const PRICE_COVERAGE = Math.round(
  (100 * COMPANIES.reduce((s, c) => s + c.ingestedPriceKeys, 0)) /
    Math.max(1, COMPANIES.reduce((s, c) => s + Object.keys(c.data.prices).length, 0)),
);
const SCREEN_DATES = quarterEnds(2015, 2026).filter((d) => d <= DATA_END);

export default function App() {
  const [tab, setTab] = useState<Tab>('backtest');
  const [config, setConfig] = useState<BacktestConfig>(PRESETS[0].config);
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  const [asOf, setAsOf] = useState<string>(SCREEN_DATES[SCREEN_DATES.length - 1]);
  const [selected, setSelected] = useState<string | null>(null);

  const deferredConfig = useDeferredValue(config);
  const { result, error } = useMemo((): { result: BacktestResult | null; error: string | null } => {
    try {
      return { result: runBacktest(COMPANIES, deferredConfig), error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [deferredConfig]);

  const store = useMemo(() => buildSnapshotStore(COMPANIES, SCREEN_DATES, config.basis, config.weights), [config.basis, config.weights]);

  const universe = config.tickers ? null : config.universe;
  const setUniverse = (u: UniverseKey) => {
    setConfig({ ...config, universe: u, tickers: undefined });
    setPresetId(null);
  };
  const applyPreset = (p: Preset) => {
    setConfig(p.config);
    setPresetId(p.id);
  };
  const editConfig = (c: BacktestConfig) => {
    setConfig(c);
    setPresetId(null);
  };

  const screenerRows = COMPANIES.filter((c) => universeFilter(universe ?? 'ALL', c) && (!config.tickers || config.tickers.includes(c.ticker)))
    .map((company) => ({ company, snap: store.get(company.ticker)!.get(asOf)! }))
    .filter((r) => r.snap);

  const rwaRows = COMPANIES.filter((c) => c.rwaSymbol).map((company) => ({
    company,
    snap: store.get(company.ticker)?.get(SCREEN_DATES[SCREEN_DATES.length - 1]),
    lastClose: priceAsOf(company.data.prices, DATA_END),
  }));

  const preset = PRESETS.find((p) => p.id === presetId);
  const selectedCompany = selected ? COMPANY_BY_TICKER[selected] : null;
  const selectedHistory = selected ? SCREEN_DATES.map((d) => store.get(selected)!.get(d)!) : [];

  return (
    <div className="mx-auto max-w-[1680px] space-y-3 p-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              Cyclical Value Backtest <span className="text-slate-500">&amp;</span> <span className="text-purple-300">Solana RWA</span> Terminal
            </h1>
            <p className="text-[11px] text-slate-500">
              Normalized-earnings (Lynch / Graham) cyclical engine · point-in-time on statutory filing dates · {COMPANIES.length} issuers · US / KR / JP
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue"><ShieldCheck size={11} /> PIT: {config.basis === 'filing' ? 'statutory filing date' : 'earnings release'}</Badge>
          <Badge tone="amber" title="See the Data Provenance tab">
            Data through {DATA_END} · fundamentals transcribed · {PRICE_COVERAGE}% of closes machine-sourced
          </Badge>
        </div>
      </header>

      <KpiCards m={result?.metrics ?? null} benchmark={config.benchmark} />
      <PresetBar active={presetId} onSelect={applyPreset} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'backtest', label: <><BarChart3 size={13} /> Backtest</> },
            { id: 'screener', label: <><Search size={13} /> PIT Screener</> },
            { id: 'trades', label: <><History size={13} /> Trade Explorer {result ? `(${result.trades.length})` : ''}</> },
            { id: 'rwabt', label: <><Coins size={13} /> RWA Token Backtest</> },
            { id: 'rwa', label: <><Wallet size={13} /> Solana RWA Live</> },
            { id: 'provenance', label: <><Database size={13} /> Data Provenance</> },
          ]}
        />
        <div className="flex items-center gap-2">
          {config.tickers && <Badge tone="purple">Preset basket: {config.tickers.join(', ')}</Badge>}
          <UniverseSwitcher value={universe ?? 'ALL'} onChange={setUniverse} companies={COMPANIES} />
        </div>
      </div>

      {tab === 'backtest' && (
        <BacktestView config={config} onChange={editConfig} result={result} error={error} dataEnd={DATA_END} presetName={preset ? `${preset.emoji} ${preset.name}` : 'Custom strategy'} />
      )}
      {tab === 'screener' && (
        <div className="space-y-3">
          <TimeMachineBar asOf={asOf} onChange={setAsOf} dataEnd={DATA_END} />
          <Screener rows={screenerRows} onSelect={setSelected} />
        </div>
      )}
      {tab === 'trades' && <TradeExplorer trades={result?.trades ?? []} companies={COMPANY_BY_TICKER} />}
      {tab === 'rwabt' && <RwaBacktestView />}
      {tab === 'rwa' && <RwaPanel rows={rwaRows} />}
      {tab === 'provenance' && <Provenance companies={COMPANIES} />}

      <Modal open={selectedCompany != null} onClose={() => setSelected(null)} title={selectedCompany ? `${selectedCompany.ticker} · point-in-time view @ ${asOf}` : ''} wide>
        {selectedCompany && <CompanyDetail company={selectedCompany} snap={store.get(selectedCompany.ticker)!.get(asOf)!} history={selectedHistory} />}
      </Modal>

      <footer className="pt-2 text-center text-[10px] text-slate-600">
        Research tool, not investment advice. Backtests are hypothetical and exclude dividends, taxes and borrow availability. Tokenized-equity
        availability, liquidity and legal eligibility vary by jurisdiction.
      </footer>
    </div>
  );
}
