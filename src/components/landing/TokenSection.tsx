"use client";

import Link from "next/link";
import { useTokenSnapshot, type TokenUiState } from "@/hooks/useTokenSnapshot";
import { RECODE_CONFIG } from "@/lib/recodeConfig";
import { changeTone, fmtPct, fmtPrice, fmtUsd, shortAddr } from "@/lib/format";
import { CopyButton } from "@/components/ui/states";

function StatusChip({ ui }: { ui: TokenUiState }) {
  if (ui === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-green/30 bg-green-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-green">
        <span className="live-dot" /> Live
      </span>
    );
  }
  if (ui === "delayed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Delayed
      </span>
    );
  }
  if (ui === "connecting") {
    return (
      <span className="inline-flex items-center rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
        Connecting to market data…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
      Market data unavailable
    </span>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="tnum mt-1.5 text-[15px] font-semibold text-text">{children}</div>
    </div>
  );
}

function Na() {
  return <span className="text-[12px] font-normal text-faint">Data unavailable</span>;
}

/**
 * RECODE Token — compact marketing card with the five public metrics,
 * powered by the same engine-backed service as the app. Display-only:
 * no holder/whale/wallet data on the landing page.
 */
export function TokenSection() {
  const { envelope, ui } = useTokenSnapshot();
  const d = envelope.data;
  // CA / chain come from the SERVER snapshot (server-authoritative —
  // client env values are not used for identity).
  const contract = d?.contract ?? null;
  const chainName = d?.chainName ?? "Robinhood Chain";
  const chainId = d?.chainId ?? 4663;
  const explorerUrl = d?.explorerUrl ?? "https://robinhoodchain.blockscout.com";
  // Cross-chain safety: the card reports the token's REAL deployment
  // chain (resolved market data), never another chain's metrics.
  const deployedElsewhere = d?.chainId != null && d.chainId !== 4663;
  const stateMessage =
    ui === "unconfigured"
      ? "Official RECODE contract not configured."
      : envelope.message ??
        (ui === "connecting"
          ? "Connecting to market data…"
          : ui === "unavailable"
            ? "Live market provider temporarily unavailable."
            : "Market data is informational only and is not investment advice.");

  return (
    <section className="border-b border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.01em] text-text">RECODE Token</h2>
            <p className="mt-2 text-[13.5px] text-muted">
              Live market data from the RECODE token on {deployedElsewhere && d ? `${d.chainName ?? "its deployed chain"} (chain ${d.chainId})` : chainName}.
            </p>
          </div>
          <StatusChip ui={ui} />
        </div>

        <div className="landing-card overflow-hidden rounded-[8px] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <span className="tnum text-[13px] font-bold tracking-wide text-text">
              ${RECODE_CONFIG.symbol}
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-faint">
              {(deployedElsewhere && d ? d.chainName : chainName)?.toUpperCase()} · {deployedElsewhere && d ? d.chainId : chainId}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Price">
              {ui === "connecting" ? (
                <span className="text-[12px] font-normal text-faint">Loading…</span>
              ) : d?.price != null ? (
                fmtPrice(d.price)
              ) : (
                <Na />
              )}
            </Metric>
            <Metric label="24H Change">
              {ui === "connecting" ? (
                <span className="text-[12px] font-normal text-faint">Loading…</span>
              ) : d?.change24hPct != null ? (
                <span className={changeTone(d.change24hPct)}>{fmtPct(d.change24hPct)}</span>
              ) : (
                <Na />
              )}
            </Metric>
            <Metric label="Market Cap">
              {d?.marketCap != null ? fmtUsd(d.marketCap) : <Na />}
            </Metric>
            <Metric label="24H Volume">
              {d?.volume24h != null ? fmtUsd(d.volume24h) : <Na />}
            </Metric>
            <Metric label="Liquidity">
              {d?.liquidity != null ? fmtUsd(d.liquidity) : <Na />}
            </Metric>
          </div>

          {/* RECODE Official CA - future-ready: renders the real address
              (with explorer link + copy) the moment RECODE_CONFIG.contractAddress
              is set; until then it displays the honest TBA state. */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                RECODE Official CA
              </div>
              {RECODE_CONFIG.contractAddress ? (
                <span className="tnum mt-0.5 flex items-center gap-2 text-[12.5px] font-semibold">
                  <a
                    href={`${explorerUrl}/token/${contract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green transition-colors hover:underline"
                    title="View on explorer"
                  >
                    {shortAddr(RECODE_CONFIG.contractAddress, 10, 8)}
                  </a>
                  <CopyButton
                    text={contract ?? ""}
                    label="Copy RECODE contract address"
                  />
                </span>
              ) : (
                <span className="tnum mt-0.5 block text-[12.5px] font-semibold text-text">
                  TBA
                </span>
              )}
            </div>
            {RECODE_CONFIG.contractAddress ? null : (
              <span className="rounded-[4px] border border-line bg-panel-2 px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint">
                Coming soon
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <p className="max-w-md text-[10.5px] leading-relaxed text-faint">
              {ui === "unconfigured"
                ? stateMessage
                : ui === "unavailable" && envelope.message
                  ? envelope.message
                  : deployedElsewhere
                    ? `RECODE token is deployed on ${d?.chainName ?? "another chain"} — the metrics above are that deployment's verified market data.`
                    : "Market data is informational only and is not investment advice."}
            </p>
            <Link
              href={contract ? "/app/asset/RECODE" : "/app/token"}
              className="rounded-[4px] btn-accent px-4 py-2 text-[12px] font-semibold text-green transition-colors"
            >
              View RECODE Token →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
