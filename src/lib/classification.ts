/**
 * ============================================================
 * CENTRAL ASSET CLASSIFICATION — RECODE sector taxonomy
 * ============================================================
 * One normalized classification layer shared by server (sync engine,
 * API routes) and client (category tabs, filters, search, counts).
 *
 * Rules:
 * - Classification is derived from VERIFIED PROVIDER METADATA about the
 *   UNDERLYING company/asset (Yahoo Finance assetProfile sector/industry),
 *   never from the token symbol, and never guessed in components.
 * - "Unknown" is a real state: assets without sufficient verified metadata
 *   appear under ALL but never inside a sector tab.
 * - ASSET TYPE (tokenized-stock, etf, treasury…) and SECTOR are separate
 *   systems: RWA aggregates classify by asset type; this file classifies
 *   companies by sector. An asset carries both.
 */

export type SectorCategory =
  | "Technology"
  | "Financials"
  | "Healthcare"
  | "Energy"
  | "Consumer"
  | "Industrial"
  | "Communications"
  | "Utilities"
  | "Materials"
  | "Real Estate"
  | "Unknown";

/** The sector tabs currently surfaced in the UI (design order). */
export const SECTOR_TABS_CORE: readonly SectorCategory[] = [
  "Technology",
  "Financials",
  "Healthcare",
  "Energy",
  "Consumer",
  "Industrial",
];

/** Extended registry — supported by the architecture, surfaced when data exists. */
export const SECTOR_TABS_EXTENDED: readonly SectorCategory[] = [
  "Communications",
  "Utilities",
  "Materials",
  "Real Estate",
];

/** Full registry (future-proof; UI is generated from this configuration). */
export const SECTOR_REGISTRY: readonly SectorCategory[] = [
  ...SECTOR_TABS_CORE,
  ...SECTOR_TABS_EXTENDED,
];

/** Provider (GICS-style) sector → RECODE sector. Verified vocabulary mapping. */
const PROVIDER_SECTOR_MAP: Record<string, SectorCategory> = {
  technology: "Technology",
  "financial services": "Financials",
  healthcare: "Healthcare",
  energy: "Energy",
  "consumer cyclical": "Consumer",
  "consumer defensive": "Consumer",
  industrials: "Industrial",
  "communication services": "Communications",
  utilities: "Utilities",
  "basic materials": "Materials",
  "real estate": "Real Estate",
};

/**
 * Provider industry keywords → RECODE sector. Secondary source, used only
 * when the provider sector itself is missing. Keywords come from real
 * provider industry strings (Yahoo assetProfile.industry).
 */
const PROVIDER_INDUSTRY_KEYWORDS: readonly [RegExp, SectorCategory][] = [
  [/semiconductor|software|hardware|cloud|computer|it services|cyber|internet content|electronic/i, "Technology"],
  [/bank|insurance|capital markets|asset management|broker|financial|credit services|payments|fintech/i, "Financials"],
  [/pharma|biotech|medical|health|life sciences|diagnostics/i, "Healthcare"],
  [/oil|gas|renewable|solar|utility|power|energy infrastructure/i, "Energy"],
  [/retail|restaurant|travel|apparel|household|beverage|food|auto manufacturers|packaging|leisure|lodging/i, "Consumer"],
  [/aerospace|defense|construction|machinery|transportation|logistics|airline|rail|industrial|engineering|manufacturing/i, "Industrial"],
  [/telecom|wireless|media|entertainment|interactive media|broadcasting/i, "Communications"],
];

/**
 * Normalize a provider sector (+ optional provider industry) into the RECODE
 * sector category. Returns "Unknown" when the provider gives nothing we can
 * confidently map — assets are never forced into a sector.
 */
export function normalizeSector(
  providerSector: string | null | undefined,
  providerIndustry?: string | null | undefined,
): SectorCategory {
  const s = providerSector?.trim().toLowerCase();
  if (s) {
    const mapped = PROVIDER_SECTOR_MAP[s];
    if (mapped) return mapped;
  }
  const ind = providerIndustry?.trim();
  if (ind) {
    for (const [re, sector] of PROVIDER_INDUSTRY_KEYWORDS) {
      if (re.test(ind)) return sector;
    }
  }
  return "Unknown";
}

/**
 * Tab list for a sector-filtered table: the core design tabs always render;
 * extended registry tabs appear only when at least one verified asset is
 * classified into them (keeps the UI honest without hardcoding).
 */
export function sectorTabsFor(
  classifiedSectors: Iterable<string>,
): { key: string; extended: boolean }[] {
  const present = new Set(
    [...classifiedSectors].map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const tabs: { key: string; extended: boolean }[] = SECTOR_TABS_CORE.map((s) => ({
    key: s,
    extended: false,
  }));
  for (const s of SECTOR_TABS_EXTENDED) {
    if (present.has(s.toLowerCase())) tabs.push({ key: s, extended: true });
  }
  return tabs;
}

/**
 * ── MANUAL VERIFIED MAPPING (classificationSource: "manual_verified_mapping") ──
 *
 * WHY THIS EXISTS: the only keyless provider that exposed company sector
 * metadata (Yahoo Finance assetProfile) closed its public API (401/404/406 as
 * of this deployment). Until a keyless/credentialed provider supplies sector
 * metadata again, the underlying-company sector is resolved from THIS single
 * centralized, documented map.
 *
 * WHAT IT IS: underlying ticker → RECODE sector for the public companies in
 * the verified Robinhood Chain registry. These are static, publicly
 * documented company classifications (GICS-aligned) — NOT market data, NOT
 * guessed from token names, NOT fabricated numbers. ETFs/funds/commodity
 * trusts (SPY, QQQ, GLD, SLV, SGOV, USO, EWY) intentionally have NO sector:
 * they are not companies, so they stay "Unknown" for sector filtering and
 * are handled by the ASSET-TYPE system (RWA aggregates) instead.
 *
 * The live provider-metadata path (Yahoo assetProfile via the sync engine)
 * remains wired and takes precedence automatically if it becomes reachable
 * again — classifications then update without touching this file.
 */
export const MANUAL_SECTOR_MAP: Record<string, SectorCategory> = {
  // Technology — semiconductors, software, hardware, cloud/AI infrastructure
  NVDA: "Technology", AAPL: "Technology", MSFT: "Technology", AMD: "Technology",
  INTC: "Technology", MU: "Technology", TSM: "Technology", SNDK: "Technology",
  SKYHY: "Technology", ORCL: "Technology", IBM: "Technology", DELL: "Technology",
  QUBT: "Technology", CRWV: "Technology", PLTR: "Technology", BB: "Technology",
  FIG: "Technology", MSTR: "Technology",
  // Communications — interactive media, entertainment (GICS Communication Services)
  GOOGL: "Communications", META: "Communications", NFLX: "Communications",
  RDDT: "Communications", SNAP: "Communications", RBLX: "Communications",
  TTWO: "Communications", DJT: "Communications", AMC: "Communications",
  // Financials — capital markets / fintech
  COIN: "Financials", CRCL: "Financials",
  // Consumer — retail, autos, apparel (GICS Consumer Discretionary/Staples)
  TSLA: "Consumer", AMZN: "Consumer", COST: "Consumer", BABA: "Consumer",
  LULU: "Consumer", RIVN: "Consumer", GME: "Consumer",
  // Healthcare — pharma, biotech, telehealth
  LLY: "Healthcare", HIMS: "Healthcare", MRNA: "Healthcare", JNJ: "Healthcare",
  // Industrial — aerospace
  SPCX: "Industrial", BE: "Industrial",
  // Materials — rare-earth mining
  USAR: "Materials",
  // NOTE: SPY, QQQ, GLD, SLV, SGOV, USO, EWY = ETFs/funds → no company sector
};

/** Classification provenance, surfaced internally with every asset. */
export type ClassificationSource =
  | "provider_metadata"
  | "manual_verified_mapping"
  | null;

/**
 * Resolve the RECODE sector for an asset: verified provider metadata first,
 * then the centralized manual-verified mapping, else "Unknown" (never guessed).
 */
export function resolveSector(
  underlyingSymbol: string | null | undefined,
  providerSector: string | null | undefined,
  providerIndustry: string | null | undefined,
): { sector: SectorCategory; source: ClassificationSource } {
  const provider = normalizeSector(providerSector, providerIndustry);
  if (provider !== "Unknown") return { sector: provider, source: "provider_metadata" };
  const ticker = underlyingSymbol?.trim().toUpperCase();
  if (ticker && MANUAL_SECTOR_MAP[ticker]) {
    return { sector: MANUAL_SECTOR_MAP[ticker], source: "manual_verified_mapping" };
  }
  return { sector: "Unknown", source: null };
}
