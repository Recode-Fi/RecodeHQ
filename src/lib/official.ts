/**
 * Official RECODE links + central constants (single source of truth for
 * marketing/docs URLs). Overridable via NEXT_PUBLIC_* env variables.
 */
export const OFFICIAL_LINKS = {
  website: process.env.NEXT_PUBLIC_RECODE_SITE_URL ?? "https://recode-fi.xyz",
  docs: process.env.NEXT_PUBLIC_RECODE_DOCS_URL ?? "https://recode-fi.xyz/docs",
  githubOrg: process.env.NEXT_PUBLIC_RECODE_GITHUB_URL ?? "https://github.com/Recode-Fi",
  /** The application repository (may differ from the org profile). */
  githubRepo: "https://github.com/Recode-Fi/RecodeHQ",
  x: process.env.NEXT_PUBLIC_RECODE_TWITTER_URL ?? "https://x.com/RecodeHQ",
} as const;
