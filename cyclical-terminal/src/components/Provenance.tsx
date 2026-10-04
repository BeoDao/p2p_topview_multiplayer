import { Database, ExternalLink, ShieldAlert, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Company } from '../data';
import { BENCHMARK_SPECS, INDICATOR_SPECS } from '../data/marketIndicators';
import { INDUSTRY_BENCHMARKS } from '../data/industryBenchmarks';
import type { Country } from '../types';
import { CompanyLogo } from './CompanyLogo';
import { Badge, Card } from './ui';

function regulatorLink(c: Company): string {
  switch (c.regulator) {
    case 'SEC':
      return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.regulatorId}&type=${encodeURIComponent(c.data.filings[0]?.form ?? '10-K')}`;
    case 'DART':
      return 'https://dart.fss.or.kr/dsab007/main.do';
    case 'EDINET':
      return 'https://disclosure2.edinet-fsa.go.jp/WEEE0030.aspx';
  }
}

const confTone = (c: string) => (c === 'high' ? 'emerald' : c === 'medium' ? 'amber' : 'rose') as 'emerald' | 'amber' | 'rose';

export function Provenance({ companies }: { companies: Company[] }) {
  const [country, setCountry] = useState<Country | 'ALL'>('ALL');
  const [ticker, setTicker] = useState<string>('');
  const filtered = companies.filter((c) => (country === 'ALL' || c.country === country) && (!ticker || c.ticker === ticker));
  const totals = useMemo(() => {
    let filings = 0;
    let ingested = 0;
    let prices = 0;
    for (const c of companies) {
      filings += c.data.filings.length;
      ingested += Object.values(c.filingVerification).filter((v) => v === 'ingested').length;
      prices += Object.keys(c.data.prices).length;
    }
    return { filings, ingested, prices };
  }, [companies]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
        <div className="mb-1 flex items-center gap-2 font-semibold text-amber-200">
          <ShieldAlert size={14} /> Data verification status — read before relying on any number
        </div>
        <p>
          Bundled records are <b>transcribed</b> from the issuers’ published annual reports and historical exchange closes. They are not random or
          synthetic, but they were compiled without live access to SEC EDGAR, DART or EDINET (blocked in the build environment), so individual values can
          deviate from the filed figures — balance-sheet sub-totals and exact filing dates are the least certain. Each company carries an honest confidence
          rating. Run the ingestion pipeline to replace transcribed records with regulator-sourced ones; ingested rows are marked <b>ingested</b> below and
          override the transcribed values automatically.
        </p>
        <div className="mt-2 grid gap-1 font-mono text-[11px] text-slate-300 sm:grid-cols-2">
          <span><Terminal size={11} className="mr-1 inline" />SEC_USER_AGENT="you@example.com" npm run ingest:sec</span>
          <span><Terminal size={11} className="mr-1 inline" />DART_API_KEY=… npm run ingest:dart</span>
          <span><Terminal size={11} className="mr-1 inline" />EDINET_API_KEY=… npm run ingest:edinet</span>
          <span><Terminal size={11} className="mr-1 inline" />npm run import:prices -- prices.csv</span>
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
          <span>{totals.filings} annual filings</span>
          <span>{totals.ingested} ingested</span>
          <span>{totals.filings - totals.ingested} transcribed</span>
          <span>{totals.prices} quarter-end closes</span>
        </div>
      </div>

      <Card
        title="SEC / DART / EDINET audit trail"
        icon={<Database size={14} className="text-blue-400" />}
        right={
          <div className="flex gap-1">
            {(['ALL', 'US', 'KR', 'JP'] as const).map((k) => (
              <button key={k} onClick={() => { setCountry(k); setTicker(''); }} className={`rounded border px-2 py-0.5 text-[11px] ${country === k ? 'border-blue-500/60 text-blue-200' : 'border-slate-700 text-slate-400'}`}>
                {k}
              </button>
            ))}
            <select className="input w-28" value={ticker} onChange={(e) => setTicker(e.target.value)}>
              <option value="">All issuers</option>
              {companies.filter((c) => country === 'ALL' || c.country === country).map((c) => (
                <option key={c.ticker} value={c.ticker}>{c.ticker}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.ticker} className="rounded border border-slate-800">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/50 px-2 py-1.5">
                <CompanyLogo meta={c} size={22} />
                <span className="text-xs font-semibold text-slate-100">{c.ticker} · {c.name}</span>
                <Badge tone="blue">{c.regulator} {c.regulator === 'SEC' ? 'CIK' : c.regulator === 'DART' ? 'corp_code' : 'code'} {c.regulatorId}</Badge>
                <Badge tone={confTone(c.data.confidence.fundamentals)}>fundamentals: {c.data.confidence.fundamentals}</Badge>
                <Badge tone={confTone(c.data.confidence.prices)}>prices: {c.data.confidence.prices}</Badge>
                {c.ingestedPriceKeys > 0 && <Badge tone="emerald">{c.ingestedPriceKeys} ingested prices</Badge>}
                <a href={regulatorLink(c)} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-300">
                  regulator filings <ExternalLink size={10} />
                </a>
              </div>
              {c.data.notes && <div className="border-b border-slate-800 px-2 py-1 text-[10px] text-slate-500">{c.data.notes}</div>}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {['FY', 'Period end', 'Announced', 'Filed (PIT key)', 'Lag (days)', 'Form', 'Document id', 'Status'].map((h) => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.data.filings.map((f) => {
                      const lag = Math.round((Date.parse(f.filingDate) - Date.parse(f.periodEnd)) / 86_400_000);
                      const status = c.filingVerification[f.periodEnd];
                      return (
                        <tr key={f.periodEnd} className="border-t border-slate-800/50">
                          <td className="td">FY{f.fiscalYear}</td>
                          <td className="td num">{f.periodEnd}</td>
                          <td className="td num text-slate-400">{f.announceDate ?? '—'}</td>
                          <td className="td num text-emerald-300/90">{f.filingDate}</td>
                          <td className="td num text-right text-slate-400">{lag}</td>
                          <td className="td text-[11px]">{f.form}</td>
                          <td className="td num text-[10px] text-slate-500">{f.documentId ?? '—'}</td>
                          <td className="td"><Badge tone={status === 'ingested' ? 'emerald' : status === 'mixed' ? 'blue' : 'amber'}>{status}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Industry driver series">
          <table className="w-full">
            <thead>
              <tr>{['Key', 'Series', 'Unit', 'Agg.', 'Source', 'Conf.'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {Object.values(INDICATOR_SPECS).map((s) => (
                <tr key={s.key} className="border-t border-slate-800/50" title={s.notes}>
                  <td className="td num text-[11px]">{s.key}</td>
                  <td className="td text-[11px]">{s.label}</td>
                  <td className="td text-[10px] text-slate-400">{s.unit}</td>
                  <td className="td text-[10px] text-slate-400">{s.aggregation}</td>
                  <td className="td whitespace-normal text-[10px] text-slate-500">{s.source}</td>
                  <td className="td"><Badge tone={confTone(s.confidence)}>{s.confidence}</Badge></td>
                </tr>
              ))}
              {Object.entries(BENCHMARK_SPECS).map(([k, s]) => (
                <tr key={k} className="border-t border-slate-800/50">
                  <td className="td num text-[11px]">{k}</td>
                  <td className="td text-[11px]">{s.label}</td>
                  <td className="td text-[10px] text-slate-400">close</td>
                  <td className="td text-[10px] text-slate-400">quarter-end</td>
                  <td className="td whitespace-normal text-[10px] text-slate-500">{s.source}</td>
                  <td className="td"><Badge tone={confTone(s.confidence)}>{s.confidence}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Model assumptions (not reported data)">
          <table className="w-full">
            <thead>
              <tr>{['Industry', 'Through-cycle margin', 'Norm. ROIC', 'Bear / Base / Bull'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {Object.values(INDUSTRY_BENCHMARKS).map((b) => (
                <tr key={b.label} className="border-t border-slate-800/50">
                  <td className="td text-[11px]">{b.label}</td>
                  <td className="td num text-right">{(b.throughCycleMargin * 100).toFixed(0)}%</td>
                  <td className="td num text-right">{(b.normalizedRoic * 100).toFixed(0)}%</td>
                  <td className="td num text-right text-[11px]">
                    {(b.scenario.bear * 100).toFixed(0)}% / {(b.scenario.base * 100).toFixed(0)}% / {(b.scenario.bull * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
