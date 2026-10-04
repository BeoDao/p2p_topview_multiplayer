// Dataset integrity checks: schema, point-in-time ordering, accounting identities and price continuity.
// Usage: npm run validate:data        (exit code 1 on hard errors; warnings are informational)
import { US_GLOBAL_COMPANIES } from '../src/data/realHistoricalData';
import { KOREAN_CYCLICAL_COMPANIES } from '../src/data/koreanCyclicalCompanies';
import { JAPANESE_CYCLICAL_COMPANIES } from '../src/data/japaneseCyclicalCompanies';
import { UNIVERSE } from '../src/data/universe';
import type { AnnualFiling, CompanyDataset } from '../src/types';

const NUMERIC: (keyof AnnualFiling)[] = [
  'revenue', 'operatingIncome', 'netIncome', 'da', 'interestExpense', 'capex', 'cash', 'totalDebt', 'totalEquity',
  'totalAssets', 'currentAssets', 'currentLiabilities', 'retainedEarnings', 'inventory', 'sharesDiluted',
];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const all: CompanyDataset[] = [...US_GLOBAL_COMPANIES, ...KOREAN_CYCLICAL_COMPANIES, ...JAPANESE_CYCLICAL_COMPANIES];
const errors: string[] = [];
const warnings: string[] = [];

for (const meta of UNIVERSE) if (!all.some((d) => d.ticker === meta.ticker)) errors.push(`${meta.ticker}: no dataset`);

for (const d of all) {
  const tag = d.ticker.padEnd(6);
  let prevEnd = '';
  for (const f of d.filings) {
    const id = `${tag} FY${f.fiscalYear}`;
    if (!ISO.test(f.periodEnd) || !ISO.test(f.filingDate)) errors.push(`${id}: bad date format`);
    if (f.periodEnd <= prevEnd) errors.push(`${id}: filings not strictly ascending`);
    prevEnd = f.periodEnd;
    if (f.filingDate <= f.periodEnd) errors.push(`${id}: filed on/before period end (look-ahead)`);
    if (f.announceDate && (f.announceDate <= f.periodEnd || f.announceDate > f.filingDate)) errors.push(`${id}: announceDate outside (periodEnd, filingDate]`);
    const lag = (Date.parse(f.filingDate) - Date.parse(f.periodEnd)) / 86_400_000;
    if (lag > 200) warnings.push(`${id}: filing lag ${lag.toFixed(0)}d`);
    for (const k of NUMERIC) if (typeof f[k] !== 'number' || !Number.isFinite(f[k] as number)) errors.push(`${id}: ${k} not finite`);
    if (f.sharesDiluted <= 0) errors.push(`${id}: non-positive shares`);
    if (f.currentAssets > f.totalAssets) errors.push(`${id}: currentAssets > totalAssets`);
    if (f.cash > f.totalAssets) errors.push(`${id}: cash > totalAssets`);
    if (f.revenue <= 0) errors.push(`${id}: non-positive revenue`);
    if (Math.abs(f.netIncome) > f.revenue) warnings.push(`${id}: |net income| > revenue`);
  }
  const keys = Object.keys(d.prices).sort();
  for (const k of keys) {
    if (!ISO.test(k)) errors.push(`${tag}: bad price key ${k}`);
    if (!(d.prices[k] > 0)) errors.push(`${tag}: non-positive price at ${k}`);
  }
  for (let i = 1; i < keys.length; i++) {
    const r = d.prices[keys[i]] / d.prices[keys[i - 1]];
    if (r > 3 || r < 1 / 3) warnings.push(`${tag}: price ${keys[i - 1]}→${keys[i]} ×${r.toFixed(2)} (check split basis)`);
  }
}

const summary = all.map((d) => `${d.ticker}:${d.filings.length}y/${Object.keys(d.prices).length}q`).join(' ');
console.log(`Datasets: ${all.length}\n${summary}\n`);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
