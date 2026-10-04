#!/usr/bin/env node
// Solana tokenized-equity ingestion → src/data/ingested/rwa/<SYMBOL>.json (+ daily/<UNDERLYING>.json)
//
// Usage:  npm run ingest:rwa [-- NVDAx TSLAx ...]       (no API keys needed; run on a machine with internet access)
//
// For every symbol in src/data/solanaRwa.ts (plus SPYx / QQQx benchmarks):
// 1. DexScreener search → Solana pairs whose base-token symbol EXACTLY equals the symbol. The deepest-liquidity pair
//    defines the mint. If none exists the file is written with status "not-found", so the terminal can show that the
//    token is not listed (instead of silently using the stock price).
// 2. GeckoTerminal daily OHLCV for every matching pool (up to 5, ≥ $1k liquidity): close = volume-weighted close across
//    pools, volumeUsd = summed USD volume. One bar per UTC day.
// 3. Yahoo Finance daily closes of the underlying listed share (for premium/discount and the stock-price comparison).
//
// Rate limits: GeckoTerminal ≈ 30 req/min → the script sleeps 2.2 s between OHLCV calls.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INGEST_DIR, ROOT, sleep } from './lib/common.mjs';

const { RWA_TOKENS, RWA_BENCHMARK_TOKENS } = await import(path.join(ROOT, 'src', 'data', 'solanaRwa.ts'));
const RWA_DIR = path.join(INGEST_DIR, 'rwa');
const DAILY_DIR = path.join(INGEST_DIR, 'daily');
const UA = { 'User-Agent': 'cyclical-value-terminal/0.1 (research)', Accept: 'application/json' };

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (res.status === 429) {
      await sleep(15_000);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  throw new Error(`rate limited — ${url}`);
}

async function resolvePairs(symbol) {
  const json = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
  const pairs = (json.pairs ?? []).filter((p) => p.chainId === 'solana' && p.baseToken?.symbol === symbol);
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  if (!pairs.length) return null;
  const mint = pairs[0].baseToken.address;
  return { mint, top: pairs[0], pools: pairs.filter((p) => p.baseToken.address === mint && (p.liquidity?.usd ?? 0) >= 1000).slice(0, 5) };
}

async function poolBars(pairAddress) {
  // GeckoTerminal returns [timestamp, open, high, low, close, volume] newest first; currency=usd, token=base.
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`;
  const json = await getJson(url);
  const list = json?.data?.attributes?.ohlcv_list ?? [];
  return list.map(([ts, , , , close, volume]) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close, volume }));
}

async function underlyingDaily(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5y`;
  const json = await getJson(url);
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error('no chart result');
  const closes = {};
  const volumes = {};
  const q = r.indicators.quote[0];
  r.timestamp.forEach((ts, i) => {
    const d = new Date((ts + (r.meta.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10);
    if (q.close[i] > 0) {
      closes[d] = Math.round(q.close[i] * 1e4) / 1e4; // Yahoo "close" = split-adjusted, not dividend-adjusted
      volumes[d] = q.volume[i] ?? 0;
    }
  });
  return { ticker, source: url, closes, volumes, ingestedAt: new Date().toISOString() };
}

async function ingest(token) {
  const now = new Date().toISOString();
  const resolved = await resolvePairs(token.symbol);
  if (!resolved) {
    await writeFile(
      path.join(RWA_DIR, `${token.symbol}.json`),
      JSON.stringify({ symbol: token.symbol, underlying: token.underlying, status: 'not-found', resolvedAt: now, source: 'DexScreener search (Solana, exact symbol)' }, null, 2) + '\n',
    );
    console.log(`– ${token.symbol.padEnd(6)} not listed on Solana`);
    return;
  }
  const agg = new Map(); // date → { pv, v }
  for (const pool of resolved.pools) {
    try {
      for (const b of await poolBars(pool.pairAddress)) {
        const a = agg.get(b.date) ?? { pv: 0, v: 0, last: b.close };
        a.pv += b.close * Math.max(b.volume, 1e-9);
        a.v += b.volume;
        agg.set(b.date, a);
      }
    } catch (e) {
      console.warn(`  ! ${token.symbol} pool ${pool.pairAddress}: ${e.message}`);
    }
    await sleep(2200);
  }
  const bars = {};
  for (const [d, a] of [...agg].sort()) bars[d] = { close: +(a.pv / Math.max(a.v, 1e-9)).toFixed(6), volumeUsd: Math.round(a.v) };
  const out = {
    symbol: token.symbol,
    underlying: token.underlying,
    status: 'found',
    resolvedAt: now,
    mint: resolved.mint,
    name: resolved.top.baseToken.name,
    pairAddress: resolved.top.pairAddress,
    dexId: resolved.top.dexId,
    liquidityUsd: resolved.top.liquidity?.usd ?? null,
    source: `DexScreener (mint) + GeckoTerminal daily OHLCV, pools: ${resolved.pools.map((p) => `${p.dexId}:${p.pairAddress}`).join(', ')}`,
    bars,
  };
  await writeFile(path.join(RWA_DIR, `${token.symbol}.json`), JSON.stringify(out) + '\n');
  console.log(`✔ ${token.symbol.padEnd(6)} mint ${resolved.mint} · ${Object.keys(bars).length} daily bars · ${resolved.pools.length} pools`);
}

await mkdir(RWA_DIR, { recursive: true });
await mkdir(DAILY_DIR, { recursive: true });
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = [...RWA_TOKENS, ...RWA_BENCHMARK_TOKENS].filter((t) => !only.length || only.includes(t.symbol));
for (const t of targets) {
  try {
    await ingest(t);
  } catch (e) {
    console.error(`✘ ${t.symbol}: ${e.message}`);
  }
  try {
    const d = await underlyingDaily(t.underlying);
    await writeFile(path.join(DAILY_DIR, `${t.underlying}.json`), JSON.stringify(d) + '\n');
  } catch (e) {
    console.warn(`  ! underlying ${t.underlying}: ${e.message} (keeping existing daily file, if any)`);
  }
  await sleep(500);
}
