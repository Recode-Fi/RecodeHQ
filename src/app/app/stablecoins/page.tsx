import { MarketsTable } from "@/components/markets/MarketsTable";

export default function StablecoinsPage() {
  return (
    <MarketsTable
      title="Stablecoins"
      sub="Stable-value tokens circulating on Robinhood Chain. Backing/reserve data renders only when a verified provider reports it."
      assetType="stablecoin"
      showFilters={false}
    />
  );
}
