import { WhaleFeedSwitch } from "@/components/whales/WhaleFeedSwitch";

export default function WhalesPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Whale Activity</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
          Live feed of large on-chain flows across verified assets. Every event is a real observed
          movement — classification (accumulation vs distribution) is rule-based on transfer
          direction and frequency. Select Solana in the network menu for Solana whale activity.
        </p>
      </header>
      <WhaleFeedSwitch />
    </div>
  );
}
