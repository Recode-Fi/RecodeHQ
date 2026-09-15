import type { Metadata } from "next";
import { ChainProvider } from "@/providers/chain-provider";
import { AppShell } from "@/components/layout/AppShell";

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
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChainProvider>
      <AppShell>{children}</AppShell>
    </ChainProvider>
  );
}
