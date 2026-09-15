import { MarketsTable } from "@/components/markets/MarketsTable";

export default function CommoditiesPage() {
  return (
    <MarketsTable
      title="Commodities"
      sub="Tokenized commodity exposure (gold, silver, energy) with verified on-chain market data."
      assetType="commodity"
      showFilters={false}
    />
  );
}
