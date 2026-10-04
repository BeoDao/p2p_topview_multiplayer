#!/usr/bin/env node
// OpenDART ingestion (금융감독원 전자공시) → src/data/ingested/<CODE>.dart.json
//
// Usage:  DART_API_KEY=xxxxxxxx npm run ingest:dart [-- 000660 005930 ...]
//
// 1. corpCode.xml        → resolves 고유번호 (corp_code) from the 6-digit stock code (never trusts the hard-coded id)
// 2. list.json (A001)    → 사업보고서 receipt number (rcept_no) and 접수일 (rcept_dt) = point-in-time filing date
// 3. fnlttSinglAcntAll   → consolidated (CFS) full financial statements for that business year (reprt_code 11011)
// Diluted shares are derived as net income attributable to owners ÷ diluted EPS (both as filed).
import { adjustShares, cachedFetch, loadUniverse, onlyTickers, sleep, writeIngested } from './lib/common.mjs';
import { unzip } from './lib/zip.mjs';

const KEY = process.env.DART_API_KEY;
if (!KEY) {
  console.error('Set DART_API_KEY (issue one at https://opendart.fss.or.kr/).');
  process.exit(1);
}
const API = 'https://opendart.fss.or.kr/api';
const SCALE = 1e9; // KRW_B

async function corpCodes() {
  const zip = await cachedFetch(`${API}/corpCode.xml?crtfc_key=${KEY}`, { binary: true, cacheKey: 'dart_corpcode' });
  const xml = unzip(zip).find((e) => e.name.toUpperCase().endsWith('.XML')).data.toString('utf8');
  const map = new Map();
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const corp = /<corp_code>(\d+)<\/corp_code>/.exec(m[1])?.[1];
    const stock = /<stock_code>\s*(\d{6})\s*<\/stock_code>/.exec(m[1])?.[1];
    if (corp && stock) map.set(stock, corp);
  }
  return map;
}

const num = (s) => {
  if (s == null || s === '' || s === '-') return undefined;
  const v = Number(String(s).replace(/,/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(v) ? v : undefined;
};

/** First matching account (by account_id, then by Korean name) within a statement division. */
function pick(rows, divs, ids, names = []) {
  for (const id of ids) {
    const r = rows.find((x) => divs.includes(x.sj_div) && x.account_id === id);
    if (r && num(r.thstrm_amount) != null) return num(r.thstrm_amount);
  }
  for (const n of names) {
    const r = rows.find((x) => divs.includes(x.sj_div) && x.account_nm.replace(/\s/g, '') === n);
    if (r && num(r.thstrm_amount) != null) return num(r.thstrm_amount);
  }
  return undefined;
}

function sumAccounts(rows, divs, ids) {
  let total = 0;
  let found = false;
  for (const id of ids) {
    const r = rows.find((x) => divs.includes(x.sj_div) && x.account_id === id);
    const v = r ? num(r.thstrm_amount) : undefined;
    if (v != null) {
      total += v;
      found = true;
    }
  }
  return found ? total : undefined;
}

async function annualReports(corp) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${API}/list.json?crtfc_key=${KEY}&corp_code=${corp}&bgn_de=20150101&end_de=20261231&pblntf_detail_ty=A001&page_no=${page}&page_count=100`;
    const json = await cachedFetch(url, { cacheKey: `dart_list_${corp}_${page}` });
    if (json.status !== '000') break;
    out.push(...json.list);
    if (page >= Number(json.total_page)) break;
  }
  // Keep the ORIGINAL report per period (amendments start with "[기재정정]" and must not move the PIT date earlier).
  const byPeriod = new Map();
  for (const r of out) {
    const period = /\((\d{4})\.(\d{2})\)/.exec(r.report_nm);
    if (!period || !r.report_nm.includes('사업보고서')) continue;
    const key = `${period[1]}-${period[2]}`;
    const prev = byPeriod.get(key);
    if (!prev || r.rcept_dt < prev.rcept_dt) byPeriod.set(key, r);
  }
  return byPeriod;
}

async function ingest(company, codes) {
  const corp = codes.get(company.stockCode);
  if (!corp) throw new Error(`corp_code not found for stock code ${company.stockCode}`);
  if (corp !== company.regulatorId) console.warn(`  ! ${company.ticker}: universe id ${company.regulatorId} ≠ DART ${corp} (using DART)`);
  const reports = await annualReports(corp);
  const filings = [];
  for (const [ym, rep] of [...reports].sort()) {
    const year = Number(ym.slice(0, 4));
    const url = `${API}/fnlttSinglAcntAll.json?crtfc_key=${KEY}&corp_code=${corp}&bsns_year=${year}&reprt_code=11011&fs_div=CFS`;
    const json = await cachedFetch(url, { cacheKey: `dart_fs_${corp}_${year}` });
    if (json.status !== '000') {
      console.warn(`  ! ${company.ticker} ${year}: ${json.message}`);
      continue;
    }
    const rows = json.list;
    const IS = ['IS', 'CIS'];
    const netIncome = pick(rows, IS, ['ifrs-full_ProfitLossAttributableToOwnersOfParent'], ['지배기업의소유주에게귀속되는당기순이익', '지배기업소유주지분']);
    const dilutedEps = pick(rows, IS, ['ifrs-full_DilutedEarningsLossPerShare'], ['희석주당이익', '희석주당순이익']);
    const d = `${rep.rcept_dt.slice(0, 4)}-${rep.rcept_dt.slice(4, 6)}-${rep.rcept_dt.slice(6, 8)}`;
    const rec = {
      periodEnd: `${ym}-${ym.endsWith('12') ? '31' : '30'}`,
      fiscalYear: year,
      filingDate: d,
      form: '사업보고서',
      documentId: rep.rcept_no,
    };
    const put = (k, v) => {
      if (v != null) rec[k] = v / SCALE;
    };
    put('revenue', pick(rows, IS, ['ifrs-full_Revenue'], ['매출액', '수익(매출액)', '영업수익']));
    put('operatingIncome', pick(rows, IS, ['dart_OperatingIncomeLoss'], ['영업이익', '영업이익(손실)']));
    put('netIncome', netIncome);
    put('interestExpense', pick(rows, IS, ['ifrs-full_InterestExpense', 'ifrs-full_FinanceCosts'], ['이자비용', '금융비용']));
    put('da', sumAccounts(rows, ['CF'], ['ifrs-full_AdjustmentsForDepreciationExpense', 'ifrs-full_AdjustmentsForAmortisationExpense']) ?? pick(rows, ['CF'], ['ifrs-full_AdjustmentsForDepreciationAndAmortisationExpense']));
    const capex = pick(rows, ['CF'], ['ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'], ['유형자산의취득']);
    if (capex != null) rec.capex = Math.abs(capex) / SCALE;
    put('cash', sumAccounts(rows, ['BS'], ['ifrs-full_CashAndCashEquivalents', 'dart_ShortTermDepositsNotClassifiedAsCashEquivalents', 'ifrs-full_ShorttermDepositsNotClassifiedAsCashEquivalents', 'ifrs-full_CurrentInvestments']));
    put('totalDebt', sumAccounts(rows, ['BS'], ['ifrs-full_ShorttermBorrowings', 'dart_ShortTermBorrowings', 'ifrs-full_CurrentPortionOfLongtermBorrowings', 'dart_CurrentPortionOfBonds', 'ifrs-full_LongtermBorrowings', 'dart_LongTermBorrowingsGross', 'dart_BondsIssued', 'ifrs-full_BondsIssued']));
    put('totalEquity', pick(rows, ['BS'], ['ifrs-full_EquityAttributableToOwnersOfParent'], ['지배기업의소유주에게귀속되는자본', '지배기업소유주지분']));
    put('totalAssets', pick(rows, ['BS'], ['ifrs-full_Assets'], ['자산총계']));
    put('currentAssets', pick(rows, ['BS'], ['ifrs-full_CurrentAssets'], ['유동자산']));
    put('currentLiabilities', pick(rows, ['BS'], ['ifrs-full_CurrentLiabilities'], ['유동부채']));
    put('retainedEarnings', pick(rows, ['BS'], ['ifrs-full_RetainedEarnings'], ['이익잉여금', '이익잉여금(결손금)']));
    put('inventory', pick(rows, ['BS'], ['ifrs-full_Inventories'], ['재고자산']));
    if (netIncome != null && dilutedEps) rec.sharesDiluted = adjustShares(company.ticker, netIncome / dilutedEps / 1e6, d);
    filings.push(rec);
    await sleep(120);
  }
  const file = await writeIngested(company.ticker, 'dart', { source: 'OpenDART fnlttSinglAcntAll (CFS, 11011)', filings });
  console.log(`✔ ${company.ticker} ${filings.length} annual periods → ${file}`);
}

const universe = await loadUniverse();
const codes = await corpCodes();
for (const c of onlyTickers(universe, 'KR')) {
  try {
    await ingest(c, codes);
  } catch (e) {
    console.error(`✘ ${c.ticker}: ${e.message}`);
  }
}
