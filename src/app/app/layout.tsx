import type { Metadata } from "next";
import { ChainProvider } from "@/providers/chain-provider";
import { AppShell } from "@/components/layout/AppShell";
import { AppGate } from "@/components/gate/AppGate";

export const metadata: Metadata = {
  title: {
    default: "RECODE App — Market Intelligence",
    template: "%s · RECODE App",
  },
};

/**
 * The website initialization overlay lives in the ROOT layout (once per
 * session, rendered for both / and /app entry) — do not add a second
 * instance here.
 *
 * AppGate: the terminal requires a connected compatible wallet. The
 * global providers (root layout) are the source of truth — the gate
 * renders in place of the shell until a wallet is connected, and the
 * previously-authorized wallet restores access on refresh.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChainProvider>
      <AppGate>
        <AppShell>{children}</AppShell>
      </AppGate>
    </ChainProvider>
  );
}
