import { describe, expect, it } from "vitest";
import { etMinutesOfDay, tradingStatusOf } from "../src/lib/tradingSession";

/*
 * Fixed instants with known America/New_York offsets:
 *  - Jan 2026 → EST (UTC−5)
 *  - Jun 2026 → EDT (UTC−4)
 */
const T = (utc: string) => Date.parse(utc);

describe("etMinutesOfDay", () => {
  it("converts UTC instants to ET minutes (DST-safe)", () => {
    // 2026-01-15T15:00:00Z = 10:00 ET
    const a = etMinutesOfDay(T("2026-01-15T15:00:00Z"));
    expect(a.minutes).toBe(600);
    expect(a.weekday).toBe(4); // Thursday
    // 2026-06-16T14:00:00Z = 10:00 ET (EDT)
    const b = etMinutesOfDay(T("2026-06-16T14:00:00Z"));
    expect(b.minutes).toBe(600);
  });
});

describe("tradingStatusOf", () => {
  it("MARKET OPEN during the core session (09:30–16:00 ET, weekdays)", () => {
    expect(
      tradingStatusOf({ now: T("2026-01-15T15:00:00Z"), capabilities: null }),
    ).toBe("MARKET OPEN");
    expect(
      tradingStatusOf({ now: T("2026-06-16T14:00:00Z"), capabilities: null }),
    ).toBe("MARKET OPEN");
  });

  it("EXTENDED HOURS only when the asset declares the capability", () => {
    // 08:00 ET Wednesday
    const now = T("2026-01-14T13:00:00Z");
    expect(tradingStatusOf({ now, capabilities: ["extended"] })).toBe("EXTENDED HOURS");
    expect(tradingStatusOf({ now, capabilities: null })).toBe("CLOSED");
    expect(tradingStatusOf({ now, capabilities: ["day"] })).toBe("CLOSED");
  });

  it("OVERNIGHT only when the asset declares 24/5 / overnight capability", () => {
    // 21:00 ET Wednesday (20:00–04:00 overnight window)
    const now = T("2026-01-14T02:00:00Z");
    expect(tradingStatusOf({ now, capabilities: ["overnight"] })).toBe("OVERNIGHT");
    expect(tradingStatusOf({ now, capabilities: ["24/5"] })).toBe("OVERNIGHT");
    expect(tradingStatusOf({ now, capabilities: ["extended"] })).toBe("CLOSED");
    expect(tradingStatusOf({ now, capabilities: null })).toBe("CLOSED");
  });

  it("CLOSED on weekends even for 24/5 assets (no weekday session)", () => {
    expect(
      tradingStatusOf({ now: T("2026-01-17T15:00:00Z"), capabilities: ["24/5"] }),
    ).toBe("CLOSED");
  });

  it("HALTED overrides everything — provider-flagged trading halt", () => {
    expect(
      tradingStatusOf({ now: T("2026-01-15T15:00:00Z"), halted: true, capabilities: ["day"] }),
    ).toBe("HALTED");
    expect(
      tradingStatusOf({ now: T("2026-01-14T02:00:00Z"), halted: true, capabilities: ["overnight"] }),
    ).toBe("HALTED");
  });

  it("04:00 ET boundary: overnight ends, extended begins", () => {
    const at = T("2026-01-14T09:00:00Z"); // 04:00 ET exactly
    expect(tradingStatusOf({ now: at, capabilities: ["extended", "overnight"] })).toBe("EXTENDED HOURS");
    const before = T("2026-01-14T08:30:00Z"); // 03:30 ET
    expect(tradingStatusOf({ now: before, capabilities: ["extended", "overnight"] })).toBe("OVERNIGHT");
  });
});
