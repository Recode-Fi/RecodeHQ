import type { Metadata } from "next";
import DocsPage from "./page";

export const metadata: Metadata = {
  title: { absolute: "RECODE Documentation" },
  description: "Understand the terminal. Explore the intelligence layer.",
  alternates: { canonical: "https://recode-fi.xyz/docs" },
  openGraph: {
    title: "RECODE Documentation",
    description: "Understand the terminal. Explore the intelligence layer.",
    siteName: "RECODE",
    type: "website",
    url: "https://recode-fi.xyz/docs",
  },
};

export default function DocsMetadataLayout({ children }: { children: React.ReactNode }) {
  return children;
}