# Cyclical Value Backtest & Solana RWA Terminal

A Bloomberg-style research terminal that applies Peter Lynch / Benjamin Graham **normalized-earnings** analysis to 34
cyclical stocks (18 US/global, 8 KOSPI, 8 TSE). It runs a **point-in-time** screener and a backtester, and maps 15 names
to Solana tokenized-equity (RWA) symbols.

Stack: Vite · React 18 · TypeScript (strict) · Tailwind CSS · lucide-react · recharts · html-to-image.

```bash
cd cyclical-terminal
npm install
npm run dev            # http://localhost:5173
npm test               # vitest: PIT, normalization, classifier, backtest invariants
npm run lint           # eslint (0 errors, 0 warnings)
npm run typecheck      # tsc strict
npm run validate:data  # dataset integrity report
npm run build
```

## ⚠️ Data status — read first

| Layer | Status |
|---|---|
| Company fundamentals (34 issuers, FY2014–FY2024/25) | **Transcribed** from the issuers' published 10-K / 20-F / 40-F / 사업보고서 / 有価証券報告書. Not random or synthetic. But SEC EDGAR, DART and EDINET were unreachable from the build sandbox, so no value was machine-checked against the regulator. Every company has an honest `confidence` rating and `notes`. Balance-sheet subtotals and exact filing dates are the weakest fields. Where a filing date was uncertain, the later date was used, so look-ahead bias can only shrink. |
| Quarter-end closes 2014Q4–2025Q4 | **Mostly machine-sourced.** `src/data/ingested/<TICKER>.prices.json` files hold closes from public raw-file mirrors of real market data, with the source URLs recorded in each file. They override the transcribed values by date. Full coverage: the 18 US names (except VALE/CCJ/RIO/BHP, which stop in 2016–17) and all 8 KRX names (official KRX closes). The 8 TSE names are covered for 2017Q1–2021Q3 only (JPX). All other quarters remain transcribed. Where a sourced close was more than 5% away from the transcribed one, the sourced value is used: CLF, the KRX mid-caps and Advantest 2017–18. HMM and Hanwha Ocean use raw KRX closes from 2017Q4 and are not adjusted for rights issues. |
| Commodity / freight / index / FX drivers, benchmarks | Mostly computed from public mirrors of the original publishers (EIA, World Bank Pink Sheet, Baltic Exchange, SSE, FRED, ISM, Fed H.10, …), with exact URLs in `src/data/marketIndicators.ts`. HRC_US, NEWBUILD, ETHYLENE_SPREAD and WFE are labelled *recalled, no machine source*. |
| Industry through-cycle margins / ROIC | Model assumptions, shown as such in the UI. |
| Solana RWA mint / liquidity / price | Fetched live from the DexScreener public API at runtime. No address is hard-coded. |
| Tokenized-equity daily bars (RWA Token Backtest) | **None bundled yet.** DexScreener and GeckoTerminal are blocked in the build sandbox, so run `npm run ingest:rwa` on a machine with internet access. Each symbol is then either resolved on-chain (mint and daily bars) or recorded as *not listed*. Only NVDAx, TSLAx, CVXx and XOMx are confirmed by public sources; the other mapped tokens are *unverified* and may not exist. |
| Underlying daily closes 2024-07 → 2026-07-30 | Machine-sourced (Yahoo split-adjusted close via a public mirror) for 12 of the 15 RWA underlyings plus XOM, SPY and QQQ. VALE, CCJ, RIO and BHP are missing. |

The bundled data ends at **2025-12-31**. 2026 is selectable in the UI but disabled until newer data is ingested.

### Replacing transcribed data with regulator data

```bash
npm run ingest:rwa                                                 # Solana token mints + daily on-chain bars + underlying daily closes
SEC_USER_AGENT="Your Name you@example.com" npm run ingest:sec      # SEC companyfacts XBRL (no key)
DART_API_KEY=...   npm run ingest:dart                             # OpenDART fnlttSinglAcntAll (CFS)
EDINET_API_KEY=... npm run ingest:edinet                           # EDINET API v2, 有価証券報告書 CSV
npm run import:prices -- prices.csv                                # ticker,date,close (any frequency)
```

The scripts write `src/data/ingested/*.json`. The loader (`src/data/index.ts`) merges these field by field over the
transcribed records. The Provenance tab then shows each fiscal year as `ingested`, `mixed` or `transcribed`.

The ingestion scripts keep the value from the **first** filing that reported each period (the original filing, never
a restatement), along with that filing's date and document id. They also restate share counts to the split basis of
the price series (`scripts/lib/common.mjs`).

> These scripts were written against the documented APIs. They could not be run end-to-end from the build sandbox
> because of the network block, so expect minor element-name fixes, especially for EDINET's CSV element ids.

Importing monthly or weekly closes enables the monthly and weekly rebalance options. The bundled set is quarterly,
and the engine refuses to fake finer grids.

## RWA Token Backtest (`src/engine/rwaBacktest.ts`)

A separate **daily** engine for Solana tokenized equities. It never mixes price sources within a run:

* **On-chain token prices**: uses the token's own daily closes (volume-weighted across its Solana pools).
  * Only tokens actually resolved on-chain are tradeable.
  * Costs are the DEX fee + base slippage + √-impact, sized against the trailing 20-day on-chain USD volume.
  * Each day's fills are capped at a set share of that volume; exits that exceed the cap spill over to later days.
  * Entries are skipped when the token trades above the listed share by more than the set premium (default 2%).
  * Premium/discount is charted for each token.
* **Stock-price comparison**: the same signals run on the listed shares' daily closes over the token era (from
  2025-06-30). This mode is labelled on screen as **not** a token result.

The run window always starts at the xStocks launch (2025-06-30), because no tokenized equity traded before that.
Signals are point-in-time from filings, so in 2026 the engine uses FY2024 reports until FY2025 filings are ingested
(`npm run ingest:sec`).

The quarterly engine's "on-chain" switch is only a **cost overlay** on listed-share prices. Its RWA legs are labelled
*stock-price proxy*.

## Engines (`src/engine`)

* **`pointInTime.ts`**: A fiscal year becomes visible only on its statutory filing date (strict mode) or on its
  earnings-release date (relaxed mode). The period-end date is never used for visibility. Prices are the last close
  on or before the as-of date, and a stale price counts as *untradeable*.
* **`normalizedEarnings.ts`**: Four normalized-EPS methods, combined as the median (methods that imply a loss count
  as 0):
  * **A** – 5-year average operating margin × current revenue
  * **B** – industry through-cycle margin
  * **C** – invested capital × up-to-10-year average ROIC
  * **D** – bear / base / bull margin scenarios (P15 / P50 / P85 of history) weighted 25 / 50 / 25

  All four are computed after interest and the statutory tax rate, then converted into the price currency. Two flags
  compare normalized and trailing P/E:
  * `PEAK_TRAP`: trailing P/E ≤ 12x but normalized P/E ≥ 20x (or a normalized loss)
  * `TROUGH_BUY`: trailing P/E is a loss or > 40x, but normalized P/E < 10x
* **`cycleClassifier.ts`**: Assigns one of 8 states. It combines the company's own margin percentile, margin trend,
  revenue CAGR and inventory/sales with the industry driver's 5-year percentile, YoY and QoQ change. Drivers include
  WTI, LME copper and aluminium, 62% Fe iron ore, HRC, uranium, DAP, BDI, SCFI, newbuild prices, ethylene spread, SOX,
  US SAAR and ISM.
* **`scoring.ts`**: A 0–100 composite of five factors:
  * valuation: absolute normalized P/E plus its percentile versus the company's own point-in-time history
  * health: net debt/EBITDA, interest coverage, cash/assets and Altman Z
  * operating leverage: D&A intensity, the gap to normalized margin, historical DOL and scenario EBIT
  * catalyst: capex/D&A, capex trend, inventory destocking and driver momentum
  * cycle position
* **`backtest.ts`**: Long-only portfolio in USD.
  * Settings: 1–10 positions; equal, score-weighted or inverse-volatility sizing; 1–3x leverage with borrow cost;
    fee and slippage in bps; Solana DEX fee and slippage on RWA legs.
  * Exits: max holding period, fundamental target (normalized P/E), cycle-peak state, and a trailing stop from the
    peak price.
  * Every trade gets a post-mortem that checks whether operating leverage actually appeared in later filings, or
    whether the gain was multiple re-rating only.

Pre-tax-basis issuers (no operating-income line: XOM, CVX, OXY, CCJ, AA, DE and the three sogo shosha) have interest
added back at load time, so every engine works with an EBIT-equivalent figure.

## Known limitations

* Annual fundamentals only: no quarterly TTM data in the bundled set, although the schema and SEC ingestion support it.
* Prices are price-return only (dividends excluded). Equity is marked quarterly, so the reported maximum drawdown is
  smaller than daily marking would show.
* Tokenized-equity programmes on Solana launched mid-2025, so a token-price sample is at most about a year long. Treat
  its Sharpe ratio and CAGR as indicative only.
* Company icons are simplified vector badges drawn for this terminal, not the issuers' official logos.
