"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChain } from "@/providers/chain-provider";
import { useWallet } from "@/providers/wallet-provider";
import { useSolanaWallet } from "@/providers/solana-wallet-context";
import { getWallet } from "@/lib/wallets";
import { getSolWallet } from "@/lib/solanaWallets";
import { gateStatus, isGateNetwork, type GateNetwork } from "@/lib/gate";
import { NetworkIcon } from "@/components/ui/NetworkIcon";
import { RecodeMark } from "@/components/brand/Logo";
import { GateConnectStep } from "./GateConnect";

/** WALLET GATE — select network → connect compatible wallet → enter. */
export function WalletGate({ variant = "page" }: { variant?: "page" | "embedded" }) {
  const router = useRouter();
  const { runtimes, selected, setSelected, selectedLabel } = useChain();
  const evm = useWallet();
  const sol = useSolanaWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  const gateNetwork = isGateNetwork(selected) ? (selected as GateNetwork) : null;
  const status = gateStatus({ mounted, selected, evmAddress: evm.address, solAddress: sol.address });
  const networks = useMemo(() => runtimes.filter((r) => isGateNetwork(r.id)), [runtimes]);
  const active = gateNetwork ? networks.find((n) => n.id === gateNetwork) ?? null : null;
  const walletName =
    evm.address && evm.connectedWallet
      ? (getWallet(evm.connectedWallet)?.name ?? "EVM Wallet")
      : sol.address && sol.connectedWallet
        ? (getSolWallet(sol.connectedWallet)?.name ?? "Solana Wallet")
        : null;
  const connecting = evm.connectingWallet != null || sol.connectingWallet != null;

  return (
    <div
      className={
        variant === "page"
          ? "flex min-h-screen items-center justify-center px-4 py-12"
          : "fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-10 backdrop-blur-sm"
      }
    >
      <div className="w-full max-w-[520px] rounded-[8px] border border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          <RecodeMark size={30} />
          <div>
            <div className="text-[14px] font-bold uppercase tracking-[0.18em] text-text">
              Connect your wallet
            </div>
            <div className="text-[11.5px] text-muted">
              Choose a network and connect a compatible wallet to enter RECODE.
            </div>
          </div>
        </div>
        {status.kind === "checking" ? (
          <div className="px-6 py-14 text-center text-[13px] text-muted">Checking wallet…</div>
        ) : (
          <div className="space-y-6 px-6 py-6">
            <section>
              <StepLabel n={1} label="Select network" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {networks.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelected(n.id)}
                    className={`flex items-center gap-2 rounded-[6px] border px-3 py-2.5 text-left text-[12.5px] transition-colors ${
                      gateNetwork === n.id
                        ? "border-green/60 bg-green-soft text-text"
                        : "border-line bg-surface text-muted hover:border-line-strong"
                    }`}
                  >
                    <NetworkIcon id={n.id} size={18} />
                    <span className="truncate font-medium">{n.name}</span>
                  </button>
                ))}
              </div>
              {gateNetwork == null ? (
                <p className="mt-2 text-[11.5px] text-warn">
                  Select the network you want to use inside RECODE.
                </p>
              ) : null}
            </section>

            <section>
              <StepLabel n={2} label="Connect wallet" />
              <GateConnectStep
                status={status}
                gateNetwork={gateNetwork}
                activeName={active?.name ?? selectedLabel}
              />
              {connecting ? (
                <div className="mt-2 text-[11.5px] text-muted">Connecting…</div>
              ) : null}
              {(evm.error || sol.error) && status.kind === "connect" ? (
                <div className="mt-2 text-[11.5px] text-neg">{evm.error ?? sol.error}</div>
              ) : null}
            </section>

            <section>
              <StepLabel n={3} label="Enter RECODE" />
              {status.kind === "ready" ? (
                <>
                  <button
                    type="button"
                    onClick={() => router.push("/app")}
                    className="w-full rounded-[6px] bg-green px-5 py-3.5 text-[13px] font-bold uppercase tracking-[0.12em] text-black transition-opacity hover:opacity-90"
                  >
                    Enter RECODE Terminal →
                  </button>
                  <p className="mt-2 text-center text-[11px] text-faint">
                    {active?.name ?? selectedLabel} · read-only wallet access · no signing required
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-[6px] border border-line bg-surface px-5 py-3.5 text-[13px] font-bold uppercase tracking-[0.12em] text-faint"
                >
                  Enter RECODE Terminal →
                </button>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
      Step {n} · {label}
    </div>
  );
}