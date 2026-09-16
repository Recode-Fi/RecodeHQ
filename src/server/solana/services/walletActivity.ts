import type { SolanaRpcProvider } from "../providers/solanaRpc";

/**
 * ============================================================
 * SOLANA — wallet activity normalization (live mainnet)
 * ============================================================
 * Pipeline: getSignaturesForAddress → getTransaction (jsonParsed)
 * → classification from REAL transaction structure (pre/post SOL
 * balances + pre/post token balances + instruction programs):
 *
 *   swap        — a known DEX/aggregator program is present AND ≥2
 *                 distinct mints changed balance (structure-verified,
 *                 not inferred from balance changes alone)
 *   receive/sent — SOL or SPL delta for the wallet (system/token
 *                 transfer programs)
 *   stake       — stake-program interaction
 *   transaction — anything else, or details unavailable
 *
 * Integrity rules: amounts come from pre/post balances; USD only
 * where a verified price exists; unknown programs stay unknown;
 * failed transactions are labeled failed, never dropped.
 */

/** Known on-chain programs (id → label). Structure-based, curated. */
const PROGRAMS: { id: string; label: string; swap?: boolean }[] = [
  { id: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", label: "Jupiter", swap: true },
  { id: "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", label: "Jupiter v4", swap: true },
  { id: "JUP2jxvXaqu7N9DXT8vj5xZE8ta6u3MFT9Trhcw4uYNK", label: "Jupiter v2", swap: true },
  { id: "675kPX9MHTqS2tPgSNGbeMSvjHnNfifyYqPfRmiBLnB", label: "Raydium AMM v4", swap: true },
  { id: "675kPX9MHTqS2tPgSnGbeMSvjHnNfifyYqPfRmiBLnB", label: "Raydium AMM v4", swap: true },
  { id: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", label: "Raydium CPMM", swap: true },
  { id: "CAMMCzo5YL8w4VFF8KVHrK22GGUQcwNhmkNRo4gpqwXb", label: "Raydium CLMM", swap: true },
  { id: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", label: "Orca Whirlpool", swap: true },
  { id: "9W959DnEJH5tRCjCyL6ecTn9Vh7hTIebC1px8VWMilSx", label: "Orca Token Swap v2", swap: true },
  { id: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", label: "Meteora DLMM", swap: true },
  { id: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5MBo", label: "Meteora AMM", swap: true },
  { id: "pAMMFaySd7EiYB71m4RS8YKLGTtGVqwDHnYAYy6HbNcR", label: "PumpSwap", swap: true },
  { id: "6EF8rrecthR5Dkzon8Nwu78R8vj4dU5SVrrBxfSBjbJX", label: "Pump.fun" },
  { id: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", label: "Serum DEX v3", swap: true },
  { id: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY", label: "Phoenix", swap: true },
  { id: "2wT8Yq49kHqD3ixBFnscUevWnjhsvtgSM5dtHhFp2sh7", label: "Lifinity", swap: true },
  { id: "SwaPpA9LAaL07LiKgg64jNqknAupWqrz1U4jPCvKXkt", label: "Token Swap", swap: true },
  { id: "TokenzQdBNbLqP5VEhdkAS6EPFLC9PHnBn5qxqf6SMo", label: "Token-2022" },
  { id: "Stake11111111111111111111111111111111111111", label: "Stake" },
  { id: "Vote111111111111111111111111111111111111111", label: "Vote" },
];

export type WalletAction = "swap" | "receive" | "sent" | "stake" | "liquidity" | "transaction";

export interface WalletActivityRecord {
  signature: string;
  explorerUrl: string;
  /** Block timestamp in ms (null while unconfirmed). */
  ts: number | null;
  failed: boolean;
  /** true when getTransaction could not be resolved (RPC limit/offline). */
  detailsUnavailable: boolean;
  action: WalletAction;
  /** Human label, e.g. "Swap", "Received", "Sent", "Transaction". */
  label: string;
  /** Program/DEX label when identified from the tx structure. */
  program: string | null;
  /** Native SOL change (fee-adjusted, whole SOL). */
  solAmount: number | null;
  /** Primary token movement (exact mint). */
  tokenMint: string | null;
  tokenSymbol: string | null;
  tokenAmount: number | null;
  tokenDecimals: number | null;
  /** Secondary token for swaps (exact mint). */
  tokenOutMint: string | null;
  tokenOutSymbol: string | null;
  tokenOutAmount: number | null;
  counterparty: string | null;
  /** USD value ONLY where a verified price exists (SOL or tracked token). */
  usd: number | null;
}

export interface WalletActivityPage {
  chain: "solana";
  network: "mainnet-beta";
  address: string;
  chainOnline: boolean;
  records: WalletActivityRecord[];
  recordsCount: number;
  signaturesCount: number;
  detailsUnavailable: number;
  /** Cursor for the next older page (signature); null when exhausted/unknown. */
  nextBefore: string | null;
  hasMore: boolean;
  /** Earliest timestamp inside the fetched window. */
  oldestTs: number | null;
  updatedAt: number;
  errors: string[];
}

type TxDetail = NonNullable<Awaited<ReturnType<SolanaRpcProvider["getTransaction"]>>>;

/* ── Parsed-transaction cache (dedup + rate-limit friendliness) ── */
const DETAIL_TTL_MS = 10 * 60_000;
const DETAIL_CACHE_MAX = 600;
const detailCache = new Map<string, { at: number; detail: TxDetail | null }>();
const inflight = new Map<string, Promise<TxDetail | null>>();

export function clearWalletActivityCaches(): void {
  detailCache.clear();
  inflight.clear();
}

async function getTransactionCached(
  rpc: SolanaRpcProvider,
  signature: string,
): Promise<TxDetail | null> {
  const hit = detailCache.get(signature);
  if (hit && Date.now() - hit.at <= DETAIL_TTL_MS) return hit.detail;
  const pending = inflight.get(signature);
  if (pending) return pending;
  const task = (async () => {
    const detail = await rpc.getTransaction(signature);
    detailCache.set(signature, { at: Date.now(), detail });
    if (detailCache.size > DETAIL_CACHE_MAX) {
      const oldest = [...detailCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) detailCache.delete(oldest[0]);
    }
    return detail;
  })().finally(() => inflight.delete(signature));
  inflight.set(signature, task);
  return task;
}

interface TokenDelta {
  mint: string;
  amount: number;
  decimals: number | null;
  counterparty: string | null;
}

interface Classification {
  action: WalletAction;
  label: string;
  program: string | null;
  solAmount: number | null;
  tokens: TokenDelta[];
  tokenIn: TokenDelta | null;
  tokenOut: TokenDelta | null;
  counterparty: string | null;
}

function classify(wallet: string, detail: TxDetail): Classification {
  const meta = detail.meta;
  const keys = detail.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey === wallet);
  const solAmount =
    idx >= 0 && meta && meta.postBalances.length > idx
      ? (meta.postBalances[idx] - meta.preBalances[idx]) / 1_000_000_000
      : null;

  // SPL deltas: per-mint net change of token accounts OWNED by the wallet.
  const tokenByMint = new Map<string, TokenDelta>();
  if (meta) {
    const preByMint = new Map<string, number>();
    const postByMint = new Map<string, { amount: number; decimals: number | null }>();
    const counterparties = new Map<string, string>();
    for (const b of meta.preTokenBalances) {
      preByMint.set(b.mint, (preByMint.get(b.mint) ?? 0) + (b.uiTokenAmount.uiAmount ?? 0));
      if (b.owner && b.owner !== wallet) counterparties.set(b.mint, b.owner);
    }
    for (const b of meta.postTokenBalances) {
      postByMint.set(b.mint, {
        amount: (postByMint.get(b.mint)?.amount ?? 0) + (b.uiTokenAmount.uiAmount ?? 0),
        decimals: b.uiTokenAmount.decimals,
      });
      if (b.owner && b.owner !== wallet) counterparties.set(b.mint, b.owner);
    }
    for (const [mint, post] of postByMint) {
      const delta = post.amount - (preByMint.get(mint) ?? 0);
      if (delta !== 0) {
        tokenByMint.set(mint, {
          mint,
          amount: delta,
          decimals: post.decimals,
          counterparty: counterparties.get(mint) ?? null,
        });
      }
    }
  }

  // Programs present in the tx structure.
  let programLabel: string | null = null;
  let swapProgram: string | null = null;
  for (const ix of detail.transaction.message.instructions) {
    const id = ix.programId ?? null;
    if (!id) continue;
    const known = PROGRAMS.find((p) => p.id === id);
    if (known) {
      if (!programLabel) programLabel = known.label;
      if (known.swap && !swapProgram) swapProgram = known.label;
    }
  }

  const tokens = [...tokenByMint.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const inTok = tokens.find((t) => t.amount > 0) ?? null;
  const outTok = tokens.find((t) => t.amount < 0) ?? null;

  // Swap ONLY when a swap-capable program exists AND the tx actually
  // moved ≥2 distinct mints (structure-verified).
  if (swapProgram && tokenByMint.size >= 2) {
    return {
      action: "swap",
      label: "Swap",
      program: swapProgram,
      solAmount,
      tokens,
      tokenIn: inTok,
      tokenOut: outTok,
      counterparty: null,
    };
  }
  // System-program transfer: parsed source/destination gives the peer.
  let counterparty: string | null = null;
  for (const ix of detail.transaction.message.instructions) {
    const info = ix.parsed?.info as Record<string, unknown> | undefined;
    if (info && (info.destination || info.source)) {
      const src = typeof info.source === "string" ? info.source : null;
      const dst = typeof info.destination === "string" ? info.destination : null;
      if (src === wallet && dst) counterparty = dst;
      else if (dst === wallet && src) counterparty = src;
      if (counterparty) break;
    }
  }
  if (tokens.length === 1 && solAmount != null && Math.abs(solAmount) < 0.0000001) {
    // Pure SPL movement (no SOL change): the peer owner is known from
    // pre/post token-balance owners.
    const t = tokens[0];
    return {
      action: t.amount > 0 ? "receive" : "sent",
      label: t.amount > 0 ? "Received" : "Sent",
      program: programLabel ?? "Token Program",
      solAmount,
      tokens,
      tokenIn: t.amount > 0 ? t : null,
      tokenOut: t.amount < 0 ? t : null,
      counterparty: t.counterparty ?? counterparty,
    };
  }
  if (solAmount != null && solAmount > 0) {
    return {
      action: "receive",
      label: "Received",
      program: programLabel ?? "System",
      solAmount,
      tokens,
      tokenIn: inTok,
      tokenOut: outTok,
      counterparty,
    };
  }
  if (solAmount != null && solAmount < 0) {
    return {
      action: "sent",
      label: "Sent",
      program: programLabel ?? "System",
      solAmount,
      tokens,
      tokenIn: inTok,
      tokenOut: outTok,
      counterparty: counterparty ?? outTok?.counterparty ?? null,
    };
  }
  if (programLabel === "Stake") {
    return {
      action: "stake",
      label: "Stake",
      program: programLabel,
      solAmount,
      tokens,
      tokenIn: inTok,
      tokenOut: outTok,
      counterparty,
    };
  }
  return {
    action: "transaction",
    label: "Transaction",
    program: programLabel,
    solAmount,
    tokens,
    tokenIn: inTok,
    tokenOut: outTok,
    counterparty,
  };
}

/**
 * Fetch + normalize one page of wallet activity.
 * @param detailLimit how many transaction details to resolve per page
 *   (bounded concurrency; remaining signatures are listed with
 *   detailsUnavailable = true — never hidden, never fabricated).
 * @param before cursor (signature) for pagination.
 * @param priceOf verified price provider for USD values (exact mint only).
 */
export async function fetchWalletActivityPage(
  rpc: SolanaRpcProvider,
  address: string,
  opts: {
    limit?: number;
    detailLimit?: number;
    before?: string | null;
    priceOf?: (mint: string | null) => number | null;
    /** Grace-retry policy for 429/backoff collisions (injectable for tests). */
    graceRetries?: number;
    graceDelayMs?: number;
  } = {},
): Promise<WalletActivityPage> {
  const errors: string[] = [];
  const limit = Math.max(1, Math.min(50, opts.limit ?? 25));
  const detailLimit = Math.max(1, Math.min(25, opts.detailLimit ?? 12));
  const priceOf = opts.priceOf ?? (() => null);

  let sigs = await rpc.getSignatures(address, limit, opts.before ?? null);
  // Grace retries: the background whale/holder cycles share this RPC key's
  // server-side budget, and their bursts can 429 an interactive request.
  // Wait out the provider's actual backoff window (bounded) so a collision
  // doesn't degrade an interactive response — the result is still the
  // provider's real answer (null stays null). Retries are injectable for
  // tests (opts.graceRetries / opts.graceDelayMs).
  const graceRetries = opts.graceRetries ?? 3;
  for (let attempt = 0; attempt < graceRetries && sigs == null; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(opts.graceDelayMs ?? 2_500, (rpc.msUntilAllowed?.() ?? 0) + 250)),
    );
    sigs = await rpc.getSignatures(address, limit, opts.before ?? null);
  }
  if (sigs == null) {
    return {
      chain: "solana",
      network: "mainnet-beta",
      address,
      chainOnline: false,
      records: [],
      recordsCount: 0,
      signaturesCount: 0,
      detailsUnavailable: 0,
      nextBefore: null,
      hasMore: false,
      oldestTs: null,
      updatedAt: Date.now(),
      errors: [
        "Signature history unavailable (RPC rate limit or offline)",
        // Provider diagnostics so the degraded state is explainable, not mute.
        `rpc.lastError=${rpc.state?.lastError ?? "none"}`,
        `rpc.consecutiveFailures=${rpc.state?.consecutiveFailures ?? 0}`,
      ],
    };
  }

  const detailsUnavailable: WalletActivityRecord[] = [];
  const parsed: WalletActivityRecord[] = [];
  let detailsFailed = 0;

  // Bounded concurrency (4) — never hammer the RPC.
  const queue = [...sigs];
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const sig = queue.shift();
      if (!sig) return;
      const record: WalletActivityRecord = {
        signature: sig.signature,
        explorerUrl: `https://solscan.io/tx/${sig.signature}`,
        ts: sig.blockTime != null ? sig.blockTime * 1000 : null,
        failed: sig.err != null,
        detailsUnavailable: false,
        action: "transaction",
        label: sig.err != null ? "Failed" : "Transaction",
        program: null,
        solAmount: null,
        tokenMint: null,
        tokenSymbol: null,
        tokenAmount: null,
        tokenDecimals: null,
        tokenOutMint: null,
        tokenOutSymbol: null,
        tokenOutAmount: null,
        counterparty: null,
        usd: null,
      };
      if (sig.err != null) {
        // Failed transactions: real, real timestamp, no fabricated amounts.
        parsed.push(record);
        continue;
      }
      const detail = await getTransactionCached(rpc, sig.signature);
      if (!detail || !detail.meta) {
        detailsFailed += 1;
        record.detailsUnavailable = true;
        record.label = "Transaction";
        detailsUnavailable.push(record);
        continue;
      }
      const c = classify(address, detail);
      const price =
        c.tokenIn && priceOf(c.tokenIn.mint)
          ? (priceOf(c.tokenIn.mint) as number)
          : c.tokenOut && priceOf(c.tokenOut.mint)
            ? (priceOf(c.tokenOut.mint) as number)
            : null;
      const primary = c.tokenIn ?? c.tokenOut;
      // USD: SOL moves priced with the verified SOL price; token moves with
      // the exact-mint verified price. Absent price → null (never estimated).
      const solPrice = priceOf(null);
      const usd =
        primary && price != null
          ? Math.abs(primary.amount) * price
          : c.solAmount != null && Math.abs(c.solAmount) > 0 && solPrice != null
            ? Math.abs(c.solAmount) * solPrice
            : null;
      parsed.push({
        signature: sig.signature,
        explorerUrl: record.explorerUrl,
        ts: sig.blockTime != null ? sig.blockTime * 1000 : null,
        failed: false,
        detailsUnavailable: false,
        action: c.action,
        label: c.label,
        program: c.program,
        solAmount: c.solAmount,
        tokenMint: c.tokenIn?.mint ?? c.tokenOut?.mint ?? null,
        tokenSymbol: null,
        tokenAmount: primary ? Math.abs(primary.amount) : null,
        tokenDecimals: primary?.decimals ?? null,
        tokenOutMint: c.tokenOut?.mint ?? null,
        tokenOutSymbol: null,
        tokenOutAmount: c.tokenOut ? Math.abs(c.tokenOut.amount) : null,
        counterparty: c.counterparty,
        usd,
      });
    }
  });
  await Promise.all(workers);

  // Keep chronological order (newest first).
  const records = [...parsed, ...detailsUnavailable].sort((a, b) => {
    const at = a.ts ?? 0;
    const bt = b.ts ?? 0;
    return bt - at;
  });

  if (detailsFailed > 0) {
    errors.push(`${detailsFailed} transaction detail(s) unavailable (RPC rate limit or offline)`);
  }

  const oldestTs = records.reduce<number | null>(
    (acc, r) => (r.ts != null && (acc == null || r.ts < acc) ? r.ts : acc),
    null,
  );

  return {
    chain: "solana",
    network: "mainnet-beta",
    address,
    chainOnline: true,
    records,
    recordsCount: records.length,
    signaturesCount: sigs.length,
    detailsUnavailable: detailsFailed,
    nextBefore: sigs.length > 0 ? sigs[sigs.length - 1].signature : null,
    hasMore: sigs.length >= limit,
    oldestTs,
    updatedAt: Date.now(),
    errors,
  };
}