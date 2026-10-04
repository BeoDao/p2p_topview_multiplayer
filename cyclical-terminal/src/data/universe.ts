import type { CompanyMeta } from '../types';

// Static identity / classification metadata for the 34-company universe.
// Regulator ids: SEC CIK (US), DART 고유번호 corp_code (KR), EDINET code (JP).
// The ingestion scripts resolve ids from `stockCode` independently, so a stale id here never
// corrupts ingested data.

export const UNIVERSE: CompanyMeta[] = [
  // ───────────────────────────── 🇺🇸 US / Global ─────────────────────────────
  {
    ticker: 'VALE', name: 'Vale S.A.', country: 'US', exchange: 'NYSE', sector: 'Metals & Mining',
    industry: 'iron_ore', thesis: 'World #1 iron-ore exporter; earnings track China steel output and 62% Fe price.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000917851',
    stockCode: 'VALE', fiscalYearEnd: '12-31', driver: 'IRON_ORE', rwaSymbol: 'VALEx', tradingViewSymbol: 'NYSE:VALE',
    brand: { bg: '#00807F', fg: '#EDB111', glyph: 'mountain', mark: 'V' },
  },
  {
    ticker: 'CCJ', name: 'Cameco Corporation', country: 'US', exchange: 'NYSE', sector: 'Energy',
    industry: 'uranium', thesis: 'Largest listed uranium miner; long-term contracting cycle after a decade of under-investment.',
    reportingCurrency: 'CAD', priceCurrency: 'USD', unit: 'CAD_M', regulator: 'SEC', regulatorId: '0001009001',
    stockCode: 'CCJ', fiscalYearEnd: '12-31', driver: 'URANIUM', rwaSymbol: 'CCJx', tradingViewSymbol: 'NYSE:CCJ',
    brand: { bg: '#0B3D6E', fg: '#7FD1FF', glyph: 'bolt', mark: 'C' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'OXY', name: 'Occidental Petroleum', country: 'US', exchange: 'NYSE', sector: 'Energy',
    industry: 'oil_gas', thesis: 'Levered Permian shale producer; Berkshire accumulation after 2020 oil crash.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000797468',
    stockCode: 'OXY', fiscalYearEnd: '12-31', driver: 'WTI', rwaSymbol: 'OXYx', tradingViewSymbol: 'NYSE:OXY',
    brand: { bg: '#C8102E', fg: '#FFFFFF', glyph: 'flame', mark: 'OXY' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'CVX', name: 'Chevron Corporation', country: 'US', exchange: 'NYSE', sector: 'Energy',
    industry: 'oil_gas', thesis: 'Integrated major; upstream earnings scale with crude, downstream cushions.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000093410',
    stockCode: 'CVX', fiscalYearEnd: '12-31', driver: 'WTI', rwaSymbol: 'CVXx', tradingViewSymbol: 'NYSE:CVX',
    brand: { bg: '#0054A4', fg: '#DA291C', glyph: 'monogram', mark: 'CVX' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'XOM', name: 'Exxon Mobil Corporation', country: 'US', exchange: 'NYSE', sector: 'Energy',
    industry: 'oil_gas', thesis: 'Largest US integrated; 2020 loss year followed by record 2022 earnings.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000034088',
    stockCode: 'XOM', fiscalYearEnd: '12-31', driver: 'WTI', tradingViewSymbol: 'NYSE:XOM',
    brand: { bg: '#ED1B2D', fg: '#FFFFFF', glyph: 'monogram', mark: 'XOM' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'RIO', name: 'Rio Tinto plc', country: 'US', exchange: 'NYSE', sector: 'Metals & Mining',
    industry: 'iron_ore', thesis: 'Pilbara iron-ore cash machine plus aluminium and copper growth.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000863064',
    stockCode: 'RIO', fiscalYearEnd: '12-31', driver: 'IRON_ORE', rwaSymbol: 'RIOx', tradingViewSymbol: 'NYSE:RIO',
    brand: { bg: '#E60D2E', fg: '#FFFFFF', glyph: 'monogram', mark: 'RT' },
  },
  {
    ticker: 'BHP', name: 'BHP Group', country: 'US', exchange: 'NYSE', sector: 'Metals & Mining',
    industry: 'iron_ore', thesis: 'Diversified major (iron ore, copper, met coal); June fiscal year.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000811809',
    stockCode: 'BHP', fiscalYearEnd: '06-30', driver: 'IRON_ORE', rwaSymbol: 'BHPx', tradingViewSymbol: 'NYSE:BHP',
    brand: { bg: '#E65400', fg: '#FFFFFF', glyph: 'monogram', mark: 'BHP' },
  },
  {
    ticker: 'AA', name: 'Alcoa Corporation', country: 'US', exchange: 'NYSE', sector: 'Metals & Mining',
    industry: 'aluminum', thesis: 'Pure-play aluminium & alumina; extreme operating leverage to LME price and energy cost.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0001675149',
    stockCode: 'AA', fiscalYearEnd: '12-31', driver: 'ALUMINUM', rwaSymbol: 'AAx', tradingViewSymbol: 'NYSE:AA',
    brand: { bg: '#1C3F94', fg: '#FFFFFF', glyph: 'ring', mark: 'A' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'CLF', name: 'Cleveland-Cliffs Inc.', country: 'US', exchange: 'NYSE', sector: 'Steel',
    industry: 'steel', thesis: 'Integrated US flat-rolled steel; transformed by 2020 AK Steel / ArcelorMittal USA deals.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000764065',
    stockCode: 'CLF', fiscalYearEnd: '12-31', driver: 'HRC_US', tradingViewSymbol: 'NYSE:CLF',
    brand: { bg: '#3A3A3A', fg: '#F7A800', glyph: 'monogram', mark: 'CLF' },
  },
  {
    ticker: 'NUE', name: 'Nucor Corporation', country: 'US', exchange: 'NYSE', sector: 'Steel',
    industry: 'steel', thesis: 'EAF mini-mill leader; variable-cost structure but huge spread leverage at peak HRC.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000073309',
    stockCode: 'NUE', fiscalYearEnd: '12-31', driver: 'HRC_US', rwaSymbol: 'NUEx', tradingViewSymbol: 'NYSE:NUE',
    brand: { bg: '#00548F', fg: '#FFFFFF', glyph: 'monogram', mark: 'N' },
  },
  {
    ticker: 'MOS', name: 'The Mosaic Company', country: 'US', exchange: 'NYSE', sector: 'Chemicals',
    industry: 'fertilizer', thesis: 'Phosphate + potash producer; earnings swing with DAP and crop prices.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0001285785',
    stockCode: 'MOS', fiscalYearEnd: '12-31', driver: 'DAP', rwaSymbol: 'MOSx', tradingViewSymbol: 'NYSE:MOS',
    brand: { bg: '#00843D', fg: '#FFFFFF', glyph: 'monogram', mark: 'M' },
  },
  {
    ticker: 'FCX', name: 'Freeport-McMoRan Inc.', country: 'US', exchange: 'NYSE', sector: 'Metals & Mining',
    industry: 'copper', thesis: 'Largest listed copper producer (Grasberg); levered to LME copper.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000831259',
    stockCode: 'FCX', fiscalYearEnd: '12-31', driver: 'COPPER', rwaSymbol: 'FCXx', tradingViewSymbol: 'NYSE:FCX',
    brand: { bg: '#B87333', fg: '#FFFFFF', glyph: 'mountain', mark: 'FCX' },
  },
  {
    ticker: 'CAT', name: 'Caterpillar Inc.', country: 'US', exchange: 'NYSE', sector: 'Capital Goods',
    industry: 'machinery', thesis: 'Mining / construction / energy equipment bellwether; dealer inventory cycle.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000018230',
    stockCode: 'CAT', fiscalYearEnd: '12-31', driver: 'ISM_PMI', rwaSymbol: 'CATx', tradingViewSymbol: 'NYSE:CAT',
    brand: { bg: '#FFCD11', fg: '#000000', glyph: 'gear', mark: 'CAT' },
  },
  {
    ticker: 'DE', name: 'Deere & Company', country: 'US', exchange: 'NYSE', sector: 'Capital Goods',
    industry: 'machinery', thesis: 'Farm-equipment leader; replacement cycle tied to farm income.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000315189',
    stockCode: 'DE', fiscalYearEnd: '10-31', driver: 'ISM_PMI', rwaSymbol: 'DEx', tradingViewSymbol: 'NYSE:DE',
    brand: { bg: '#367C2B', fg: '#FFDE00', glyph: 'monogram', mark: 'DE' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: 'MU', name: 'Micron Technology', country: 'US', exchange: 'NASDAQ', sector: 'Semiconductors',
    industry: 'memory', thesis: 'DRAM/NAND pure-play; textbook commodity memory cycle, now HBM.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000723125',
    stockCode: 'MU', fiscalYearEnd: '09-01', driver: 'SOX', tradingViewSymbol: 'NASDAQ:MU',
    brand: { bg: '#0D4F8B', fg: '#FFFFFF', glyph: 'chip', mark: 'MU' }, isTech: true,
  },
  {
    ticker: 'AMD', name: 'Advanced Micro Devices', country: 'US', exchange: 'NASDAQ', sector: 'Semiconductors',
    industry: 'logic_semis', thesis: 'CPU/GPU share gainer; PC and data-center capex cycles.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0000002488',
    stockCode: 'AMD', fiscalYearEnd: '12-31', driver: 'SOX', rwaSymbol: 'AMDx', tradingViewSymbol: 'NASDAQ:AMD',
    brand: { bg: '#000000', fg: '#ED1C24', glyph: 'chip', mark: 'AMD' }, isTech: true,
  },
  {
    ticker: 'NVDA', name: 'NVIDIA Corporation', country: 'US', exchange: 'NASDAQ', sector: 'Semiconductors',
    industry: 'logic_semis', thesis: 'Accelerated-compute monopoly; gaming/crypto busts vs AI structural growth.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0001045810',
    stockCode: 'NVDA', fiscalYearEnd: '01-31', driver: 'SOX', rwaSymbol: 'NVDAx', tradingViewSymbol: 'NASDAQ:NVDA',
    brand: { bg: '#76B900', fg: '#000000', glyph: 'chip', mark: 'NV' }, isTech: true,
  },
  {
    ticker: 'TSLA', name: 'Tesla, Inc.', country: 'US', exchange: 'NASDAQ', sector: 'Autos',
    industry: 'autos', thesis: 'EV volume and price-cut cycle on top of a high-fixed-cost gigafactory base.',
    reportingCurrency: 'USD', priceCurrency: 'USD', unit: 'USD_M', regulator: 'SEC', regulatorId: '0001318605',
    stockCode: 'TSLA', fiscalYearEnd: '12-31', driver: 'US_SAAR', rwaSymbol: 'TSLAx', tradingViewSymbol: 'NASDAQ:TSLA',
    brand: { bg: '#CC0000', fg: '#FFFFFF', glyph: 'monogram', mark: 'T' }, isTech: true,
  },

  // ───────────────────────────── 🇰🇷 KOSPI ─────────────────────────────
  {
    ticker: '000660', name: 'SK hynix', nameLocal: 'SK하이닉스', country: 'KR', exchange: 'KRX', sector: 'Semiconductors',
    industry: 'memory', thesis: 'HBM leader; 2023 memory trough loss → record 2024 profit.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00164779',
    stockCode: '000660', fiscalYearEnd: '12-31', driver: 'SOX', tradingViewSymbol: 'KRX:000660',
    brand: { bg: '#EA002C', fg: '#F47725', glyph: 'wave', mark: 'SK' }, isTech: true,
  },
  {
    ticker: '011200', name: 'HMM', nameLocal: 'HMM', country: 'KR', exchange: 'KRX', sector: 'Shipping',
    industry: 'container_shipping', thesis: 'Korean container liner; 2020-22 freight spike turned chronic losses into record profit.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00164645',
    stockCode: '011200', fiscalYearEnd: '12-31', driver: 'SCFI', tradingViewSymbol: 'KRX:011200',
    brand: { bg: '#F26522', fg: '#FFFFFF', glyph: 'ship', mark: 'HMM' },
  },
  {
    ticker: '042660', name: 'Hanwha Ocean', nameLocal: '한화오션', country: 'KR', exchange: 'KRX', sector: 'Shipbuilding',
    industry: 'shipbuilding', thesis: 'Ex-DSME; years of order drought and losses, LNG-carrier backlog repricing from 2021.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00111704',
    stockCode: '042660', fiscalYearEnd: '12-31', driver: 'NEWBUILD', tradingViewSymbol: 'KRX:042660',
    brand: { bg: '#F37321', fg: '#FFFFFF', glyph: 'ship', mark: 'HO' },
  },
  {
    ticker: '005380', name: 'Hyundai Motor', nameLocal: '현대자동차', country: 'KR', exchange: 'KRX', sector: 'Autos',
    industry: 'autos', thesis: 'Global OEM; mix/pricing upcycle 2022-24 with hybrids and SUVs.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00164742',
    stockCode: '005380', fiscalYearEnd: '12-31', driver: 'US_SAAR', tradingViewSymbol: 'KRX:005380',
    brand: { bg: '#002C5F', fg: '#FFFFFF', glyph: 'ellipses', mark: 'H' },
  },
  {
    ticker: '005490', name: 'POSCO Holdings', nameLocal: 'POSCO홀딩스', country: 'KR', exchange: 'KRX', sector: 'Steel',
    industry: 'steel', thesis: 'Integrated steel + lithium value chain; steel spread drives core earnings.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00155319',
    stockCode: '005490', fiscalYearEnd: '12-31', driver: 'HRC_US', tradingViewSymbol: 'KRX:005490',
    brand: { bg: '#05507D', fg: '#FFFFFF', glyph: 'monogram', mark: 'P' },
  },
  {
    ticker: '005930', name: 'Samsung Electronics', nameLocal: '삼성전자', country: 'KR', exchange: 'KRX', sector: 'Semiconductors',
    industry: 'memory', thesis: 'Memory + foundry + devices anchor; DRAM price cycle dominates operating profit.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00126380',
    stockCode: '005930', fiscalYearEnd: '12-31', driver: 'SOX', tradingViewSymbol: 'KRX:005930',
    brand: { bg: '#1428A0', fg: '#FFFFFF', glyph: 'ellipses', mark: 'S' }, isTech: true,
  },
  {
    ticker: '051910', name: 'LG Chem', nameLocal: 'LG화학', country: 'KR', exchange: 'KRX', sector: 'Chemicals',
    industry: 'petrochemicals', thesis: 'Basic petrochemicals + battery materials; NCC spread and EV demand.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00356361',
    stockCode: '051910', fiscalYearEnd: '12-31', driver: 'ETHYLENE_SPREAD', tradingViewSymbol: 'KRX:051910',
    brand: { bg: '#A50034', fg: '#FFFFFF', glyph: 'ring', mark: 'LG' },
  },
  {
    ticker: '011170', name: 'Lotte Chemical', nameLocal: '롯데케미칼', country: 'KR', exchange: 'KRX', sector: 'Chemicals',
    industry: 'petrochemicals', thesis: 'Pure NCC / ethylene-spread play; Chinese capacity glut drove 2022-24 losses.',
    reportingCurrency: 'KRW', priceCurrency: 'KRW', unit: 'KRW_B', regulator: 'DART', regulatorId: '00165413',
    stockCode: '011170', fiscalYearEnd: '12-31', driver: 'ETHYLENE_SPREAD', tradingViewSymbol: 'KRX:011170',
    brand: { bg: '#DA291C', fg: '#FFFFFF', glyph: 'monogram', mark: 'LC' },
  },

  // ───────────────────────────── 🇯🇵 TSE ─────────────────────────────
  {
    ticker: '8058', name: 'Mitsubishi Corporation', nameLocal: '三菱商事', country: 'JP', exchange: 'TSE', sector: 'Trading House',
    industry: 'trading_house', thesis: 'Berkshire-held sogo shosha; met coal, copper and LNG drive resource earnings.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02529',
    stockCode: '8058', fiscalYearEnd: '03-31', driver: 'IRON_ORE', tradingViewSymbol: 'TSE:8058',
    brand: { bg: '#E60012', fg: '#FFFFFF', glyph: 'three-diamonds', mark: 'MC' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: '8001', name: 'ITOCHU Corporation', nameLocal: '伊藤忠商事', country: 'JP', exchange: 'TSE', sector: 'Trading House',
    industry: 'trading_house', thesis: 'Non-resource-heavy shosha with the sector’s highest ROE.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02497',
    stockCode: '8001', fiscalYearEnd: '03-31', driver: 'IRON_ORE', tradingViewSymbol: 'TSE:8001',
    brand: { bg: '#004098', fg: '#FFFFFF', glyph: 'monogram', mark: 'IT' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: '8031', name: 'Mitsui & Co.', nameLocal: '三井物産', country: 'JP', exchange: 'TSE', sector: 'Trading House',
    industry: 'trading_house', thesis: 'Australian iron ore and global LNG equity — most resource-levered shosha.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02513',
    stockCode: '8031', fiscalYearEnd: '03-31', driver: 'IRON_ORE', tradingViewSymbol: 'TSE:8031',
    brand: { bg: '#1D2088', fg: '#FFFFFF', glyph: 'monogram', mark: 'MI' }, operatingIncomeBasis: 'pretax',
  },
  {
    ticker: '8035', name: 'Tokyo Electron', nameLocal: '東京エレクトロン', country: 'JP', exchange: 'TSE', sector: 'Semiconductors',
    industry: 'semi_equipment', thesis: 'Top-3 wafer-fab equipment maker; WFE capex cycle.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02652',
    stockCode: '8035', fiscalYearEnd: '03-31', driver: 'SOX', tradingViewSymbol: 'TSE:8035',
    brand: { bg: '#003C8F', fg: '#FFFFFF', glyph: 'chip', mark: 'TEL' }, isTech: true,
  },
  {
    ticker: '6857', name: 'Advantest', nameLocal: 'アドバンテスト', country: 'JP', exchange: 'TSE', sector: 'Semiconductors',
    industry: 'semi_equipment', thesis: 'SoC + memory tester duopolist; AI/HBM test intensity.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E01950',
    stockCode: '6857', fiscalYearEnd: '03-31', driver: 'SOX', tradingViewSymbol: 'TSE:6857',
    brand: { bg: '#8A1538', fg: '#FFFFFF', glyph: 'chip', mark: 'ADV' }, isTech: true,
  },
  {
    ticker: '7203', name: 'Toyota Motor', nameLocal: 'トヨタ自動車', country: 'JP', exchange: 'TSE', sector: 'Autos',
    industry: 'autos', thesis: 'World #1 OEM; HEV mix and weak yen drove record margins.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02144',
    stockCode: '7203', fiscalYearEnd: '03-31', driver: 'US_SAAR', tradingViewSymbol: 'TSE:7203',
    brand: { bg: '#EB0A1E', fg: '#FFFFFF', glyph: 'ellipses', mark: 'T' },
  },
  {
    ticker: '7011', name: 'Mitsubishi Heavy Industries', nameLocal: '三菱重工業', country: 'JP', exchange: 'TSE', sector: 'Capital Goods',
    industry: 'heavy_industry', thesis: 'Japan #1 defense prime and gas-turbine maker; defense budget doubling.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E02126',
    stockCode: '7011', fiscalYearEnd: '03-31', driver: 'ISM_PMI', tradingViewSymbol: 'TSE:7011',
    brand: { bg: '#E60012', fg: '#FFFFFF', glyph: 'three-diamonds', mark: 'MHI' },
  },
  {
    ticker: '5401', name: 'Nippon Steel', nameLocal: '日本製鉄', country: 'JP', exchange: 'TSE', sector: 'Steel',
    industry: 'steel', thesis: 'Japan #1 steelmaker; restructuring + pricing reform turned 2020 loss into record profit.',
    reportingCurrency: 'JPY', priceCurrency: 'JPY', unit: 'JPY_B', regulator: 'EDINET', regulatorId: 'E01225',
    stockCode: '5401', fiscalYearEnd: '03-31', driver: 'HRC_US', tradingViewSymbol: 'TSE:5401',
    brand: { bg: '#0F3D7A', fg: '#FFFFFF', glyph: 'monogram', mark: 'NS' },
  },
];

export const META_BY_TICKER: Record<string, CompanyMeta> = Object.fromEntries(UNIVERSE.map((c) => [c.ticker, c]));
