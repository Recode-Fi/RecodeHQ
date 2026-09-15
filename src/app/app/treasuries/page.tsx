import { MarketsTable } from "@/components/markets/MarketsTable";

export default function TreasuriesPage() {
  return (
    <MarketsTable
      title="Treasuries"
      sub="Tokenized treasury products. Yield and backing metrics appear only when verified by a provider — RECODE never estimates returns."
      assetType="treasury"
      showFilters={false}
    />
  );
}
