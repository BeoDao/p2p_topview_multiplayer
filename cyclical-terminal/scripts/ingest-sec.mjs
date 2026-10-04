#!/usr/bin/env node
// SEC EDGAR XBRL ingestion → src/data/ingested/<TICKER>.sec.json
//
// Usage:  SEC_USER_AGENT="Your Name you@example.com" npm run ingest:sec [-- TICKER ...]
//
// Source: https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json (no API key; SEC requires a
// descriptive User-Agent and ≤10 requests/second).
//
// Point-in-time rule: for every annual period we keep the value from the FIRST filing that reported it
// (original 10-K / 20-F / 40-F), never a later restatement, and record that filing's `filed` date and
// accession number. That is exactly what the market could have known on that date.
import { adjustShares, cachedFetch, loadUniverse, onlyTickers, sleep, writeIngested } from './lib/common.mjs';

const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error('Set SEC_USER_AGENT="Your Name you@example.com" (required by SEC fair-access policy).');
  process.exit(1);
}

const ANNUAL_FORMS = new Set(['10-K', '10-K405', '20-F', '40-F', '10-KT']);

// Concept fallbacks per field: [taxonomy, concept]. First concept with data for a period wins.
const FLOW = {
  revenue: [['us-gaap', 'Revenues'], ['us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax'], ['us-gaap', 'SalesRevenueNet'], ['us-gaap', 'RevenueFromContractWithCustomerIncludingAssessedTax'], ['ifrs-full', 'Revenue']],
  operatingIncome: [['us-gaap', 'OperatingIncomeLoss'], ['ifrs-full', 'ProfitLossFromOperatingActivities']],
  netIncome: [['us-gaap', 'NetIncomeLoss'], ['us-gaap', 'NetIncomeLossAvailableToCommonStockholdersBasic'], ['ifrs-full', 'ProfitLossAttributableToOwnersOfParent']],
  da: [['us-gaap', 'DepreciationDepletionAndAmortization'], ['us-gaap', 'DepreciationAndAmortization'], ['us-gaap', 'DepreciationAmortizationAndAccretionNet'], ['ifrs-full', 'DepreciationAndAmortisationExpense'], ['ifrs-full', 'DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss']],
  interestExpense: [['us-gaap', 'InterestExpense'], ['us-gaap', 'InterestExpenseNonoperating'], ['us-gaap', 'InterestExpenseDebt'], ['ifrs-full', 'InterestExpense'], ['ifrs-full', 'FinanceCosts']],
  capex: [['us-gaap', 'PaymentsToAcquirePropertyPlantAndEquipment'], ['us-gaap', 'PaymentsToAcquireProductiveAssets'], ['ifrs-full', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']],
  sharesDiluted: [['us-gaap', 'WeightedAverageNumberOfDilutedSharesOutstanding'], ['ifrs-full', 'AdjustedWeightedAverageShares']],
};
const INSTANT = {
  cashOnly: [['us-gaap', 'CashAndCashEquivalentsAtCarryingValue'], ['us-gaap', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], ['ifrs-full', 'CashAndCashEquivalents']],
  shortTermInvestments: [['us-gaap', 'ShortTermInvestments'], ['us-gaap', 'MarketableSecuritiesCurrent'], ['us-gaap', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'], ['ifrs-full', 'CurrentInvestments']],
  longTermDebtTotal: [['us-gaap', 'LongTermDebt'], ['us-gaap', 'DebtInstrumentCarryingAmount']],
  longTermDebtNoncurrent: [['us-gaap', 'LongTermDebtNoncurrent'], ['ifrs-full', 'NoncurrentPortionOfNoncurrentBorrowings'], ['ifrs-full', 'NoncurrentBorrowings']],
  longTermDebtCurrent: [['us-gaap', 'LongTermDebtCurrent'], ['ifrs-full', 'CurrentPortionOfNoncurrentBorrowings']],
  shortTermDebt: [['us-gaap', 'ShortTermBorrowings'], ['us-gaap', 'CommercialPaper'], ['ifrs-full', 'ShorttermBorrowings'], ['ifrs-full', 'CurrentBorrowings']],
  totalEquity: [['us-gaap', 'StockholdersEquity'], ['ifrs-full', 'EquityAttributableToOwnersOfParent']],
  totalAssets: [['us-gaap', 'Assets'], ['ifrs-full', 'Assets']],
  currentAssets: [['us-gaap', 'AssetsCurrent'], ['ifrs-full', 'CurrentAssets']],
  currentLiabilities: [['us-gaap', 'LiabilitiesCurrent'], ['ifrs-full', 'CurrentLiabilities']],
  retainedEarnings: [['us-gaap', 'RetainedEarningsAccumulatedDeficit'], ['ifrs-full', 'RetainedEarnings']],
  inventory: [['us-gaap', 'InventoryNet'], ['ifrs-full', 'Inventories']],
};

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Map periodEnd → { val, filed, accn, form, fy } using the earliest annual filing reporting a ~12-month duration. */
function annualFlow(facts, candidates, currency) {
  for (const [tax, concept] of candidates) {
    const units = facts?.[tax]?.[concept]?.units;
    if (!units) continue;
    const series = units[currency] ?? units.shares ?? units[Object.keys(units)[0]];
    const out = new Map();
    for (const f of series) {
      if (!ANNUAL_FORMS.has(f.form) || !f.start) continue;
      const len = days(f.start, f.end);
      if (len < 340 || len > 380) continue;
      const prev = out.get(f.end);
      if (!prev || f.filed < prev.filed) out.set(f.end, f);
    }
    if (out.size) return out;
  }
  return new Map();
}

function annualInstant(facts, candidates, currency) {
  for (const [tax, concept] of candidates) {
    const units = facts?.[tax]?.[concept]?.units;
    if (!units?.[currency]) continue;
    const out = new Map();
    for (const f of units[currency]) {
      if (!ANNUAL_FORMS.has(f.form) || f.start) continue;
      const prev = out.get(f.end);
      if (!prev || f.filed < prev.filed) out.set(f.end, f);
    }
    if (out.size) return out;
  }
  return new Map();
}

async function ingest(company) {
  const cik = company.regulatorId.padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const json = await cachedFetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cacheKey: `sec_${cik}` });
  const facts = json.facts;
  const ccy = company.reportingCurrency;
  const scale = 1e6; // USD_M / CAD_M

  const flows = Object.fromEntries(Object.entries(FLOW).map(([k, c]) => [k, annualFlow(facts, c, ccy)]));
  const inst = Object.fromEntries(Object.entries(INSTANT).map(([k, c]) => [k, annualInstant(facts, c, ccy)]));

  // The anchor is the revenue series: one record per fiscal year end that has an annual revenue fact.
  const filings = [];
  for (const [end, rev] of flows.revenue) {
    if (end < '2014-01-01') continue;
    const get = (m) => m.get(end)?.val;
    const rec = {
      periodEnd: end,
      fiscalYear: rev.fy ?? Number(end.slice(0, 4)),
      filingDate: rev.filed,
      form: rev.form,
      documentId: rev.accn,
      revenue: rev.val / scale,
    };
    const put = (key, v, div = scale) => {
      if (v != null && Number.isFinite(v)) rec[key] = v / div;
    };
    put('operatingIncome', get(flows.operatingIncome));
    put('netIncome', get(flows.netIncome));
    put('da', get(flows.da));
    put('interestExpense', get(flows.interestExpense));
    put('capex', get(flows.capex));
    const sh = get(flows.sharesDiluted);
    if (sh != null) rec.sharesDiluted = adjustShares(company.ticker, sh / 1e6, rev.filed);
    const cash = get(inst.cashOnly);
    if (cash != null) rec.cash = (cash + (get(inst.shortTermInvestments) ?? 0)) / scale;
    const ltd = get(inst.longTermDebtTotal) ?? (get(inst.longTermDebtNoncurrent) != null ? get(inst.longTermDebtNoncurrent) + (get(inst.longTermDebtCurrent) ?? 0) : undefined);
    if (ltd != null) rec.totalDebt = (ltd + (get(inst.shortTermDebt) ?? 0)) / scale;
    for (const k of ['totalEquity', 'totalAssets', 'currentAssets', 'currentLiabilities', 'retainedEarnings', 'inventory']) put(k, get(inst[k]));
    filings.push(rec);
  }
  filings.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const file = await writeIngested(company.ticker, 'sec', { source: url, filings });
  console.log(`✔ ${company.ticker.padEnd(6)} ${filings.length} annual periods → ${file}`);
}

const universe = await loadUniverse();
for (const c of onlyTickers(universe, 'US')) {
  try {
    await ingest(c);
  } catch (e) {
    console.error(`✘ ${c.ticker}: ${e.message}`);
  }
  await sleep(150);
}
