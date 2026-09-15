export interface NavItem {
  label: string;
  href: string;
  /** Shown as a "soon" chip when the surface has no live data source yet. */
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * RECODE navigation — final product structure:
 * OVERVIEW → SCAN & INTELLIGENCE → SIGNALS & FORECAST → PORTFOLIO → TOOLS
 * (Discover lives under OVERVIEW; the Screen feature has been removed.)
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Overview", href: "/" },
      { label: "Markets", href: "/app/markets" },
      { label: "Discover", href: "/app/discover" },
      { label: "Radar", href: "/app/radar" },
    ],
  },
  {
    title: "Scan & Intelligence",
    items: [
      { label: "Scan", href: "/app/scanner" },
      { label: "Asset Intelligence", href: "/app/assets" },
      { label: "Wallet Intelligence", href: "/app/wallets" },
      { label: "Smart Money", href: "/app/smart-money" },
      { label: "Whale Activity", href: "/app/whales" },
      { label: "STONK", href: "/app/stonk" },
    ],
  },
  {
    title: "Signals & Forecast",
    items: [
      { label: "Signals", href: "/app/signals" },
      { label: "Forecast", href: "/app/forecast" },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { label: "Portfolio", href: "/app/portfolio" },
      { label: "Watchlist", href: "/app/watchlist" },
      { label: "Alerts", href: "/app/alerts" },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "Transaction Explorer", href: "/app/explorer" },
    ],
  },
];

export const MOBILE_NAV = [
  { label: "Home", href: "/" },
  { label: "Markets", href: "/app/markets" },
  { label: "Discover", href: "/app/discover" },
  { label: "Portfolio", href: "/app/portfolio" },
  { label: "More", href: "__more" },
];
