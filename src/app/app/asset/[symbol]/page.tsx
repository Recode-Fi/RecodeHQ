import type { Metadata } from "next";
import { AssetView } from "@/components/asset/AssetView";

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} — Asset Intelligence` };
}

export default async function AssetPage({ params }: Props) {
  const { symbol } = await params;
  return <AssetView symbol={symbol} />;
}
