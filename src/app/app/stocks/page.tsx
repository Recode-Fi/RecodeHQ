import { MarketsTable } from "@/components/markets/MarketsTable";

export default function StocksPage() {
  return (
    <MarketsTable
      title="Tokenized Stocks"
      sub="Tokenized US equities. Each row shows the ON-CHAIN TOKEN (this network) and its provider-verified UNDERLYING security market cap. RECODE does not imply ownership rights in the underlying security."
      assetType="tokenized-stock"
      showFilters={false}
    />
  );
}
