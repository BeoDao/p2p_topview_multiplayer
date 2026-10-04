// Shared helpers for the ingestion pipelines. Run with `node --experimental-strip-types` so the TypeScript
// universe definition can be imported directly (it only uses type-only imports).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const INGEST_DIR = path.join(ROOT, 'src', 'data', 'ingested');
export const CACHE_DIR = path.join(ROOT, '.ingest-cache');

export async function loadUniverse() {
  const mod = await import(path.join(ROOT, 'src', 'data', 'universe.ts'));
  return mod.UNIVERSE;
}

/**
 * Share-count restatement to the split basis of the bundled price series (as of 2025-12-31).
 * `factor` multiplies share counts REPORTED BEFORE `effective` (divide prices by the same factor).
 * `adr` divides share counts into ADR equivalents.
 */
export const SHARE_ADJUSTMENTS = {
  NVDA: { splits: [{ effective: '2021-07-20', factor: 4 }, { effective: '2024-06-10', factor: 10 }] },
  TSLA: { splits: [{ effective: '2020-08-31', factor: 5 }, { effective: '2022-08-25', factor: 3 }] },
  BHP: { adr: 2 },
  '005930': { splits: [{ effective: '2018-05-04', factor: 50 }] },
  '7203': { splits: [{ effective: '2021-10-01', factor: 5 }] },
  '6857': { splits: [{ effective: '2023-10-01', factor: 4 }] },
  '8035': { splits: [{ effective: '2023-04-01', factor: 3 }] },
  '8058': { splits: [{ effective: '2024-01-01', factor: 3 }] },
  '8031': { splits: [{ effective: '2024-07-01', factor: 2 }] },
  '7011': { splits: [{ effective: '2017-10-01', factor: 0.1 }, { effective: '2024-04-01', factor: 10 }] },
  '5401': { splits: [{ effective: '2015-10-01', factor: 0.1 }, { effective: '2025-10-01', factor: 5 }] },
};

/** Restates a share count reported in a document filed on `reportedOn` to the current split basis. */
export function adjustShares(ticker, shares, reportedOn) {
  const adj = SHARE_ADJUSTMENTS[ticker];
  if (!adj) return shares;
  let s = shares;
  for (const sp of adj.splits ?? []) if (reportedOn < sp.effective) s *= sp.factor;
  if (adj.adr) s /= adj.adr;
  return s;
}

export async function writeIngested(ticker, suffix, payload) {
  await mkdir(INGEST_DIR, { recursive: true });
  const file = path.join(INGEST_DIR, `${ticker}.${suffix}.json`);
  await writeFile(file, JSON.stringify({ ticker, ...payload, ingestedAt: new Date().toISOString() }, null, 2) + '\n');
  return file;
}

export async function cachedFetch(url, { headers = {}, cacheKey, binary = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = cacheKey ?? url.replace(/[^a-z0-9]+/gi, '_').slice(0, 180);
  const file = path.join(CACHE_DIR, key + (binary ? '.bin' : '.json'));
  if (existsSync(file)) return binary ? readFile(file) : JSON.parse(await readFile(file, 'utf8'));
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  if (binary) {
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    return buf;
  }
  const json = await res.json();
  await writeFile(file, JSON.stringify(json));
  return json;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function onlyTickers(universe, country) {
  const arg = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  return universe.filter((c) => c.country === country && (arg.length === 0 || arg.includes(c.ticker)));
}
