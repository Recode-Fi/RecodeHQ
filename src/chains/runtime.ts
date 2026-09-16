import type { ChainRuntime } from "@/lib/types";
import { ALL_NETWORKS, NETWORKS, networkIndexed } from "@/chains/registry";

/** UI-facing runtime view of the network registry (chain abstraction). */
export function toRuntime(
  selectedId: string,
  engineChainIds: number[],
  solanaOnline = false,
  arcOnline = false,
  evmNetChain: string | null = null,
  evmNetOnline = false,
): ChainRuntime[] {
  return NETWORKS.map((n) => ({
    id: n.id,
    name: n.name,
    shortName: n.shortName,
    kind: n.kind,
    family: n.family,
    icon: n.icon,
    chainId: n.chainId,
    chainIdHex: n.chainIdHex,
    explorerUrl: n.explorerUrl,
    indexed:
      n.family === "solana"
        ? solanaOnline
        : n.id === "arc"
          ? arcOnline
          : n.id === evmNetChain
            ? evmNetOnline
            : networkIndexed(n, engineChainIds),
    note: n.note,
  }));
}

export function selectedLabel(selectedId: string): string {
  if (selectedId === ALL_NETWORKS) return "All Networks";
  return NETWORKS.find((n) => n.id === selectedId)?.name ?? "All Networks";
}
