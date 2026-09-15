/** Shared validation/coercion helpers — providers only emit confirmed values. */

export function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function asPositiveNumber(v: unknown): number | null {
  const n = asFiniteNumber(v);
  return n != null && n > 0 ? n : null;
}

export function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function asEvmAddress(v: unknown): string | null {
  const s = asNonEmptyString(v);
  return s && /^0x[a-fA-F0-9]{40}$/.test(s) ? s.toLowerCase() : null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function jitter(ms: number): number {
  return Math.max(250, Math.round(ms * (0.85 + Math.random() * 0.3)));
}