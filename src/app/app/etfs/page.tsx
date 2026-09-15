import { MarketsTable } from "@/components/markets/MarketsTable";

export default function EtfPage() {
  return (
    <MarketsTable
      title="Tokenized ETFs"
      sub="Exchange-traded funds represented as on-chain tokens, with provider-verified underlying fund market caps."
      assetType="etf"
      showFilters={false}
    />
  );
}
