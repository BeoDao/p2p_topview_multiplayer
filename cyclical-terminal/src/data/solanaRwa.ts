// Solana RWA (tokenized equity) mapping for the 15 RWA-eligible names.
// Mint addresses are deliberately NOT hard-coded: they are resolved live from the DexScreener public API
// (chainId === 'solana', exact base-token symbol match) so the terminal never shows a fabricated address.
// Tokenized-stock programmes on Solana (e.g. xStocks) launched mid-2025; backtest periods before a token's
// first on-chain trade use the underlying equity price as a synthetic proxy and are flagged as such.

export interface RwaToken {
  symbol: string;
  underlying: string;
}

export const RWA_TOKENS: RwaToken[] = [
  { symbol: 'VALEx', underlying: 'VALE' },
  { symbol: 'CCJx', underlying: 'CCJ' },
  { symbol: 'OXYx', underlying: 'OXY' },
  { symbol: 'CVXx', underlying: 'CVX' },
  { symbol: 'RIOx', underlying: 'RIO' },
  { symbol: 'BHPx', underlying: 'BHP' },
  { symbol: 'AAx', underlying: 'AA' },
  { symbol: 'NUEx', underlying: 'NUE' },
  { symbol: 'MOSx', underlying: 'MOS' },
  { symbol: 'FCXx', underlying: 'FCX' },
  { symbol: 'CATx', underlying: 'CAT' },
  { symbol: 'DEx', underlying: 'DE' },
  { symbol: 'AMDx', underlying: 'AMD' },
  { symbol: 'NVDAx', underlying: 'NVDA' },
  { symbol: 'TSLAx', underlying: 'TSLA' },
];

/** First month on-chain tokenized-equity trading was broadly available on Solana. */
export const RWA_PROGRAM_LAUNCH = '2025-06-30';
