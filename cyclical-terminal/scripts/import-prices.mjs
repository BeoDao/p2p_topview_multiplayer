#!/usr/bin/env node
// Imports closing prices from a CSV export (exchange, Bloomberg, KRX, JPX, etc.) → src/data/ingested/<TICKER>.prices.json
//
// Usage:  npm run import:prices -- path/to/prices.csv
// CSV header (any order, case-insensitive): ticker,date,close   — date as YYYY-MM-DD, close split-adjusted to the
// current basis in the listing currency. Any frequency is accepted; monthly or weekly rows unlock the monthly /
// weekly rebalance options of the backtester.
import { readFile } from 'node:fs/promises';
import { loadUniverse, writeIngested } from './lib/common.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import:prices -- prices.csv');
  process.exit(1);
}
const text = await readFile(file, 'utf8');
const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
const cols = head.split(',').map((h) => h.trim().toLowerCase());
const iT = cols.indexOf('ticker');
const iD = cols.indexOf('date');
const iC = cols.indexOf('close');
if (iT < 0 || iD < 0 || iC < 0) {
  console.error('CSV must have ticker,date,close columns.');
  process.exit(1);
}
const known = new Set((await loadUniverse()).map((c) => c.ticker));
const byTicker = new Map();
let rejected = 0;
for (const line of lines) {
  const c = line.split(',').map((x) => x.trim());
  const t = c[iT].replace(/^"|"$/g, '');
  const d = c[iD];
  const v = Number(c[iC]);
  if (!known.has(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !(v > 0)) {
    rejected++;
    continue;
  }
  if (!byTicker.has(t)) byTicker.set(t, {});
  byTicker.get(t)[d] = v;
}
for (const [t, prices] of byTicker) {
  const out = await writeIngested(t, 'prices', { source: file, prices });
  console.log(`✔ ${t.padEnd(6)} ${Object.keys(prices).length} closes → ${out}`);
}
if (rejected) console.warn(`${rejected} rows skipped (unknown ticker, bad date or non-positive close).`);
