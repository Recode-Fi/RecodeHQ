import type { Metadata } from "next";
import { TokenView } from "@/components/token/TokenView";

export const metadata: Metadata = {
  title: { absolute: "RECODE Token — Market Intelligence" },
  description: "Live market intelligence for the RECODE token on Robinhood Chain.",
};

export default function TokenPage() {
  return <TokenView />;
}
