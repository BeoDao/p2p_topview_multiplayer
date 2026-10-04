import { ExternalLink, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Company } from '../data';
import { RWA_TOKENS } from '../data/solanaRwa';
import type { Snapshot } from '../engine/snapshot';
import { fmtNum, fmtPrice, fmtSignedPct } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { Badge, Card, Modal, StateBadge } from './ui';

/** Subset of the DexScreener public pair schema we read. */
interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
}

type LiveState =
  | { status: 'idle' | 'loading' }
  | { status: 'ok'; pair: DexPair; fetchedAt: string }
  | { status: 'not-found'; fetchedAt: string }
  | { status: 'error'; message: string };

async function resolveSolanaPair(symbol: string): Promise<DexPair | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const json = (await res.json()) as { pairs?: DexPair[] | null };
  const matches = (json.pairs ?? []).filter((p) => p.chainId === 'solana' && p.baseToken.symbol === symbol);
  matches.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return matches[0] ?? null;
}

function useLiveRwa(symbols: string[]) {
  const [state, setState] = useState<Record<string, LiveState>>({});
  const refresh = useCallback(async () => {
    setState(Object.fromEntries(symbols.map((s) => [s, { status: 'loading' } as LiveState])));
    await Promise.all(
      symbols.map(async (s) => {
        try {
          const pair = await resolveSolanaPair(s);
          const fetchedAt = new Date().toISOString();
          setState((prev) => ({ ...prev, [s]: pair ? { status: 'ok', pair, fetchedAt } : { status: 'not-found', fetchedAt } }));
        } catch (e) {
          setState((prev) => ({ ...prev, [s]: { status: 'error', message: e instanceof Error ? e.message : String(e) } }));
        }
      }),
    );
  }, [symbols]);
  return { state, refresh };
}

export function RwaPanel({ rows }: { rows: { company: Company; snap: Snapshot | undefined; lastClose: { date: string; price: number } | undefined }[] }) {
  const [symbols] = useState(() => RWA_TOKENS.map((t) => t.symbol));
  const { state, refresh } = useLiveRwa(symbols);
  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const modalRow = rows.find((r) => r.company.rwaSymbol === modal);
  const modalLive = modal ? state[modal] : undefined;

  return (
    <>
      <Card
        title="Solana RWA Tokenized Equities (live DexScreener)"
        icon={<Wallet size={14} className="text-purple-400" />}
        right={
          <button onClick={() => void refresh()} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-purple-500">
            <RefreshCw size={11} /> Refresh
          </button>
        }
      >
        <p className="mb-2 text-[11px] text-slate-500">
          Mint addresses, liquidity and DEX prices are resolved live from the DexScreener public API (Solana pairs with an exact symbol match, deepest
          liquidity first). Nothing on this panel is hard-coded. Premium/discount is measured against the latest underlying close in the dataset and is
          only meaningful when that close is recent.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-800">
              <tr>
                {['Token', 'Underlying', 'Mint address', 'DEX', 'DEX price', '24h liquidity', '24h volume', 'Ref. close', 'Prem./disc.', 'Cycle state', ''].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company: c, snap, lastClose }) => {
                const sym = c.rwaSymbol!;
                const live = state[sym] ?? { status: 'idle' };
                const dexPrice = live.status === 'ok' && live.pair.priceUsd ? Number(live.pair.priceUsd) : null;
                const premium = dexPrice != null && lastClose ? dexPrice / lastClose.price - 1 : null;
                return (
                  <tr key={sym} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                    <td className="td"><Badge tone="purple">⚡ {sym}</Badge></td>
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <CompanyLogo meta={c} size={20} /> <span className="font-semibold">{c.ticker}</span>
                      </div>
                    </td>
                    <td className="td num text-[10px] text-slate-400">
                      {live.status === 'loading' && <Loader2 size={12} className="animate-spin" />}
                      {live.status === 'ok' && (
                        <a href={`https://solscan.io/token/${live.pair.baseToken.address}`} target="_blank" rel="noreferrer" className="hover:text-purple-300" title={live.pair.baseToken.address}>
                          {live.pair.baseToken.address.slice(0, 6)}…{live.pair.baseToken.address.slice(-6)}
                        </a>
                      )}
                      {live.status === 'not-found' && <span className="text-amber-400/80">no Solana pair listed</span>}
                      {live.status === 'error' && <span className="text-rose-400" title={live.message}>API unreachable</span>}
                    </td>
                    <td className="td text-[11px]">{live.status === 'ok' ? `${live.pair.dexId} / ${live.pair.quoteToken.symbol}` : '—'}</td>
                    <td className="td num text-right">{dexPrice != null ? fmtPrice(dexPrice, 'USD') : '—'}</td>
                    <td className="td num text-right">{live.status === 'ok' ? `$${fmtNum(live.pair.liquidity?.usd ?? 0, 0)}` : '—'}</td>
                    <td className="td num text-right">{live.status === 'ok' ? `$${fmtNum(live.pair.volume?.h24 ?? 0, 0)}` : '—'}</td>
                    <td className="td num text-right text-[11px]">{lastClose ? <>{fmtPrice(lastClose.price, 'USD')} <span className="text-slate-600">{lastClose.date}</span></> : '—'}</td>
                    <td className={`td num text-right ${premium == null ? '' : premium >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedPct(premium, 2)}</td>
                    <td className="td">{snap && <StateBadge state={snap.state} />}</td>
                    <td className="td">
                      <button onClick={() => setModal(sym)} className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-purple-500 hover:text-purple-200">
                        Chart
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modal != null} onClose={() => setModal(null)} title={`${modal ?? ''} · live charts`} wide>
        {modalRow && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>DexScreener — on-chain {modal} (Solana)</span>
                {modalLive?.status === 'ok' && (
                  <a href={modalLive.pair.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-purple-300">
                    open <ExternalLink size={10} />
                  </a>
                )}
              </div>
              {modalLive?.status === 'ok' ? (
                <iframe
                  title={`DexScreener ${modal}`}
                  src={`https://dexscreener.com/solana/${modalLive.pair.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
                  className="h-[440px] w-full rounded border border-slate-800"
                />
              ) : (
                <div className="flex h-[440px] items-center justify-center rounded border border-slate-800 text-xs text-slate-500">
                  {modalLive?.status === 'loading' ? 'Resolving pair…' : 'No live Solana pair resolved for this token.'}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] text-slate-400">TradingView — underlying {modalRow.company.tradingViewSymbol}</div>
              <iframe
                title={`TradingView ${modalRow.company.tradingViewSymbol}`}
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(modalRow.company.tradingViewSymbol)}&interval=D&theme=dark&style=1&hidesidetoolbar=1&withdateranges=1&locale=en`}
                className="h-[440px] w-full rounded border border-slate-800"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
