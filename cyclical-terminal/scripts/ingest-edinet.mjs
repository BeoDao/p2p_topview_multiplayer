#!/usr/bin/env node
// EDINET API v2 ingestion (金融庁) → src/data/ingested/<CODE>.edinet.json
//
// Usage:  EDINET_API_KEY=xxxxxxxx npm run ingest:edinet [-- 7203 8058 ...]
//
// 1. documents.json?type=2 for every calendar day 1 Jun – 15 Jul of each year (March fiscal year-ends file their
//    有価証券報告書 in late June). Rows with docTypeCode 120 and secCode `${code}0` are the annual securities reports;
//    submitDateTime is the point-in-time filing date. Amendments (130) are ignored so the PIT date never moves earlier.
// 2. documents/{docID}?type=5 → ZIP of XBRL-to-CSV (UTF-16LE, tab separated). Current-year consolidated values are read
//    by element id (Japanese GAAP jppfs_cor / IFRS jpigp_cor / summary jpcrp_cor).
// Diluted shares are derived as net income attributable to owners ÷ diluted EPS (as filed).
import { adjustShares, cachedFetch, loadUniverse, onlyTickers, sleep, writeIngested } from './lib/common.mjs';
import { unzip } from './lib/zip.mjs';

const KEY = process.env.EDINET_API_KEY;
if (!KEY) {
  console.error('Set EDINET_API_KEY (EDINET API v2 subscription key: https://api.edinet-fsa.go.jp/).');
  process.exit(1);
}
const API = 'https://api.edinet-fsa.go.jp/api/v2';
const SCALE = 1e9; // JPY_B
const FIRST_YEAR = 2015;
const LAST_YEAR = Number(process.env.EDINET_LAST_YEAR ?? new Date().getFullYear());

const ELEMENTS = {
  revenue: ['NetSalesSummaryOfBusinessResults', 'RevenueIFRSSummaryOfBusinessResults', 'RevenuesUSGAAPSummaryOfBusinessResults', 'OperatingRevenue1SummaryOfBusinessResults', 'NetSales', 'RevenueIFRS'],
  operatingIncome: ['OperatingIncome', 'OperatingProfitLossIFRS', 'OperatingIncomeLossUSGAAPSummaryOfBusinessResults', 'ProfitLossBeforeTaxIFRS'],
  netIncome: ['ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults', 'ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults', 'NetIncomeLossAttributableToOwnersOfParentUSGAAPSummaryOfBusinessResults'],
  dilutedEps: ['DilutedEarningsPerShareSummaryOfBusinessResults', 'DilutedEarningsLossPerShareIFRSSummaryOfBusinessResults', 'DilutedNetIncomeLossPerShareUSGAAPSummaryOfBusinessResults'],
  da: ['DepreciationAndAmortizationOpeCF', 'DepreciationAndAmortizationOpeCFIFRS'],
  interestExpense: ['InterestExpensesNOE', 'FinanceCostsIFRS', 'InterestExpensesIFRS'],
  capex: ['PurchaseOfPropertyPlantAndEquipmentInvCF', 'PurchaseOfPropertyPlantAndEquipmentInvCFIFRS', 'PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssetsInvCFIFRS'],
  cash: ['CashAndCashEquivalentsSummaryOfBusinessResults', 'CashAndCashEquivalentsIFRSSummaryOfBusinessResults'],
  totalEquity: ['EquityAttributableToOwnersOfParentIFRSSummaryOfBusinessResults', 'ShareholdersEquity', 'EquityAttributableToOwnersOfParentIFRS'],
  totalAssets: ['TotalAssetsSummaryOfBusinessResults', 'TotalAssetsIFRSSummaryOfBusinessResults', 'TotalAssetsUSGAAPSummaryOfBusinessResults'],
  currentAssets: ['CurrentAssets', 'CurrentAssetsIFRS'],
  currentLiabilities: ['CurrentLiabilities', 'TotalCurrentLiabilitiesIFRS'],
  retainedEarnings: ['RetainedEarnings', 'RetainedEarningsIFRS'],
  inventory: ['Inventories', 'InventoriesCAIFRS'],
};
const DEBT_ELEMENTS = [
  'ShortTermLoansPayable', 'CommercialPapersLiabilities', 'CurrentPortionOfBonds', 'CurrentPortionOfLongTermLoansPayable', 'BondsPayable', 'LongTermLoansPayable',
  'BondsAndBorrowingsCLIFRS', 'BondsAndBorrowingsNCLIFRS', 'BorrowingsCLIFRS', 'BorrowingsNCLIFRS',
];

function parseCsv(buf) {
  const text = buf.toString('utf16le').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split('\t').map((h) => h.replace(/"/g, ''));
  const idx = (name) => header.indexOf(name);
  const iId = idx('要素ID');
  const iRel = idx('相対年度');
  const iCons = idx('連結・個別');
  const iVal = idx('値');
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t').map((c) => c.replace(/^"|"$/g, ''));
    rows.push({ id: cols[iId] ?? '', rel: cols[iRel] ?? '', cons: cols[iCons] ?? '', val: cols[iVal] ?? '' });
  }
  return rows;
}

function valueOf(rows, names) {
  for (const n of names) {
    const r = rows.find((x) => x.id.split(':')[1] === n && (x.rel === '当期' || x.rel === '当期末') && x.cons !== '個別');
    const v = r ? Number(r.val) : NaN;
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

async function documentIndex() {
  const index = []; // { docID, secCode, submit, periodEnd }
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    for (let d = new Date(Date.UTC(y, 5, 1)); d <= new Date(Date.UTC(y, 6, 15)); d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      try {
        const json = await cachedFetch(`${API}/documents.json?date=${date}&type=2&Subscription-Key=${KEY}`, { cacheKey: `edinet_list_${date}` });
        for (const r of json.results ?? []) {
          if (r.docTypeCode === '120' && r.secCode) index.push({ docID: r.docID, secCode: r.secCode, submit: r.submitDateTime.slice(0, 10), periodEnd: r.periodEnd });
        }
      } catch (e) {
        console.warn(`  ! list ${date}: ${e.message}`);
      }
      await sleep(80);
    }
  }
  return index;
}

async function ingest(company, index) {
  const docs = index.filter((r) => r.secCode === `${company.stockCode}0`).sort((a, b) => a.submit.localeCompare(b.submit));
  const filings = [];
  for (const doc of docs) {
    let rows;
    try {
      const zip = await cachedFetch(`${API}/documents/${doc.docID}?type=5&Subscription-Key=${KEY}`, { binary: true, cacheKey: `edinet_csv_${doc.docID}` });
      rows = unzip(zip).filter((e) => e.name.endsWith('.csv')).flatMap((e) => parseCsv(e.data));
    } catch (e) {
      console.warn(`  ! ${company.ticker} ${doc.docID}: CSV unavailable (${e.message})`);
      continue;
    }
    const rec = {
      periodEnd: doc.periodEnd,
      fiscalYear: Number(doc.periodEnd.slice(0, 4)) - 1,
      filingDate: doc.submit,
      form: '有価証券報告書',
      documentId: doc.docID,
    };
    for (const [k, names] of Object.entries(ELEMENTS)) {
      if (k === 'dilutedEps') continue;
      const v = valueOf(rows, names);
      if (v != null) rec[k] = k === 'capex' ? Math.abs(v) / SCALE : v / SCALE;
    }
    const debt = DEBT_ELEMENTS.map((n) => valueOf(rows, [n])).filter((v) => v != null);
    if (debt.length) rec.totalDebt = debt.reduce((a, b) => a + b, 0) / SCALE;
    const ni = valueOf(rows, ELEMENTS.netIncome);
    const eps = valueOf(rows, ELEMENTS.dilutedEps);
    if (ni != null && eps) rec.sharesDiluted = adjustShares(company.ticker, ni / eps / 1e6, doc.submit);
    filings.push(rec);
    await sleep(120);
  }
  const file = await writeIngested(company.ticker, 'edinet', { source: 'EDINET API v2 (docTypeCode 120, CSV type=5)', filings });
  console.log(`✔ ${company.ticker} ${filings.length} annual reports → ${file}`);
}

const universe = await loadUniverse();
const targets = onlyTickers(universe, 'JP');
console.log(`Scanning EDINET document lists ${FIRST_YEAR}–${LAST_YEAR} (June–mid-July)…`);
const index = await documentIndex();
for (const c of targets) {
  try {
    await ingest(c, index);
  } catch (e) {
    console.error(`✘ ${c.ticker}: ${e.message}`);
  }
}
