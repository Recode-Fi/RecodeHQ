"use client";

import { useEffect, useState } from "react";
import { useSyncPolling } from "@/hooks/useSync";
import {
  evmNetService,
  type EvmNetChain,
  type EvmNetEngineStatus,
  type EvmNetMarketRow,
  type EvmNetRadarSignal,
  type EvmNetSmartMoneyWallet,
  type EvmNetTokenIntel,
  type EvmNetWalletActivity,
  type EvmNetWalletBalances,
  type EvmNetWhaleEvent,
} from "@/services/evmNetService";

/** EVM NET hooks — chain-parameterized, honest statuses. */

export function useEvmNetStatus(chain: EvmNetChain) {
  const poll = useSyncPolling<EvmNetEngineStatus>(`/api/evm/${chain}/status`, 15_000);
  return { data: poll.data, status: poll.status };
}

export function useEvmNetMarkets(chain: EvmNetChain) {
  const poll = useSyncPolling<EvmNetMarketRow[]>(`/api/evm/${chain}/markets`, 15_000);
  return { data: poll.data, status: poll.status };
}

export function useEvmNetWhales(chain: EvmNetChain) {
  const poll = useSyncPolling<EvmNetWhaleEvent[]>(`/api/evm/${chain}/whales`, 20_000);
  return { data: poll.data, status: poll.status };
}

export function useEvmNetRadar(chain: EvmNetChain) {
  const poll = useSyncPolling<EvmNetRadarSignal[]>(`/api/evm/${chain}/radar`, 20_000);
  return { data: poll.data, status: poll.status };
}

export function useEvmNetSmartMoney(chain: EvmNetChain, windowHours = 24) {
  const poll = useSyncPolling<EvmNetSmartMoneyWallet[]>(
    `/api/evm/${chain}/smart-money?windowHours=${windowHours}`,
    20_000,
  );
  return { data: poll.data, status: poll.status };
}

export function useEvmNetDirectLookup(chain: EvmNetChain, address: string | null) {
  const [state, setState] = useState<{
    data: EvmNetTokenIntel | null;
    status: string;
    error: string | null;
  }>({ data: null, status: "idle", error: null });

  useEffect(() => {
    if (!address) {
      setState({ data: null, status: "idle", error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, status: "loading", error: null });
    evmNetService
      .token(chain, address)
      .then((res) => {
        if (!cancelled) setState({ data: res.data, status: res.status, error: res.error ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, status: "unavailable", error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [chain, address]);

  return state;
}

export function useEvmNetWallet(chain: EvmNetChain, address: string) {
  const [balances, setBalances] = useState<EvmNetWalletBalances | null>(null);
  const [activity, setActivity] = useState<EvmNetWalletActivity | null>(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setStatus("loading");
    Promise.all([evmNetService.walletBalances(chain, address), evmNetService.walletActivity(chain, address)])
      .then(([b, a]) => {
        if (cancelled) return;
        setBalances(b.data);
        setActivity(a.data);
        setStatus(b.status);
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [chain, address]);

  return { balances, activity, status };
}