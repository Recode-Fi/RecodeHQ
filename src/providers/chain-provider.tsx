"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ALL_NETWORKS, getNetwork } from "@/chains/registry";
import { selectedLabel } from "@/chains/runtime";
import type { ChainRuntime } from "@/lib/types";
import { toRuntime } from "@/chains/runtime";
import { useEngineStatus } from "@/hooks/useSync";
import { useSolanaStatus } from "@/hooks/useSolana";

interface ChainContextValue {
  /** "all" | network id */
  selected: string;
  setSelected: (id: string) => void;
  selectedLabel: string;
  /** Networks rendered as selectable options in the UI. */
  runtimes: ChainRuntime[];
  /** True when the current filter excludes EVM engine data (e.g. a registered-but-not-yet-indexed network). */
  filterExcludesData: boolean;
  /** True when the selected network is the Solana (non-EVM) family. */
  isSolana: boolean;
}

const ChainContext = createContext<ChainContextValue | null>(null);

const STORAGE_KEY = "recode.network";

export function ChainProvider({ children }: { children: ReactNode }) {
  const [selected, setSelectedState] = useState<string>(ALL_NETWORKS);
  const [hydrated, setHydrated] = useState(false);
  const { data: engine } = useEngineStatus();
  const { data: solanaStatus } = useSolanaStatus();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === ALL_NETWORKS || getNetwork(saved))) setSelectedState(saved);
    setHydrated(true);
  }, []);

  const setSelected = useCallback((id: string) => {
    setSelectedState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage unavailable — selection stays in memory */
    }
  }, []);

  const engineChainIds = useMemo(() => {
    const ids = new Set<number>();
    if (engine?.chainId) ids.add(engine.chainId);
    for (const t of engine?.tasks ?? []) void t;
    return Array.from(ids);
  }, [engine]);

  const solanaOnline = solanaStatus?.tokensIndexed != null && solanaStatus.tokensIndexed > 0;

  const runtimes = useMemo(
    () => toRuntime(selected, engineChainIds, solanaOnline),
    [selected, engineChainIds, solanaOnline],
  );

  const value = useMemo<ChainContextValue>(() => {
    const net = selected === ALL_NETWORKS ? null : getNetwork(selected);
    return {
      selected: hydrated ? selected : ALL_NETWORKS,
      setSelected,
      selectedLabel: selectedLabel(selected),
      runtimes,
      filterExcludesData: net != null && net.family !== "solana" && net.engineChainId == null,
      isSolana: net?.family === "solana",
    };
  }, [selected, setSelected, runtimes, hydrated]);

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used inside ChainProvider");
  return ctx;
}
