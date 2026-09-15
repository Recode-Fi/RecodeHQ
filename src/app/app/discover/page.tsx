import { MarketsTable } from "@/components/markets/MarketsTable";
import { UniverseSection } from "@/components/universe/UniverseSection";

export default function DiscoverPage() {
  return (
    <div className="space-y-8">
      <MarketsTable
        title="Discover"
        sub="Browse the verified tokenized universe — sort by size, volume, momentum or holders to find what's moving."
      />
      <UniverseSection />
    </div>
  );
}
