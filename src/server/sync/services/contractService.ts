import { getOnchainProvider } from "./onchainWalletService";
import { getExplorerProvider } from "../providers/explorerInstance";
import { getSyncStore } from "../store";
import {
  decodeAbiAddress,
  decodeAbiString,
  decodeAbiUint,
} from "../providers/onchain";

/* Robinhood Chain scanner selectors & constants (verified function signatures) */
const SEL_NAME = "0x06fdde03"; // name()
const SEL_SYMBOL = "0x95d89b41"; // symbol()
const SEL_DECIMALS = "0x313ce567"; // decimals()
const SEL_TOTAL_SUPPLY = "0x18160ddd"; // totalSupply()
const SEL_IMPLEMENTATION = "0x5c60da1b"; // implementation() (transparent proxy)
const SEL_ADMIN = "0xf851a440"; // admin() (Proxy.admin)
/** keccak256("eip1967.proxy.implementation") - 1 */
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
/** keccak256("eip1967.proxy.admin") - 1 */
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ERC165_ID = "0x01ffc9a7";
const ERC721_METADATA_ID = "0x5b5e139f";
/** Transfer(address,address,uint256) topic0 */
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** Recent-activity window for the measured getLogs probe (blocks). */
const RECENT_LOG_WINDOW = 4_999;

export type ScanContractType =
  | "erc20"
  | "erc721"
  | "proxy"
  | "contract"
  | "eoa"
  | "unknown";

export interface ContractIntel {
  address: string;
  chainOnline: boolean;
  exists: boolean | null;
  isContract: boolean | null;
  contractType: ScanContractType | null;
  tokenStandard: "ERC-20" | "ERC-721" | null;
  codeSizeBytes: number | null;
  isVerified: boolean | null;
  compiler: string | null;
  evmVersion: string | null;
  license: string | null;
  creator: string | null;
  deploymentTx: string | null;
  deployedAt: number | null;
  owner: string | null; // owner() when implemented
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupplyRaw: string | null; // hex from RPC or raw string from explorer
  nameSource: "registry" | "explorer" | "rpc" | null;
  /* Proxy inspection (EIP-1967 + common getters) */
  isProxy: boolean | null;
  implementation: string | null;
  adminAddress: string | null;
  /* Market data — only for indexed priced markets, only verified values */
  market: {
    price: number | null;
    change24hPct: number | null;
    marketCap: number | null;
    fdv: number | null;
    volume24h: number | null;
    liquidity: number | null; // structurally unavailable without an indexer
    liquidityConfigured: boolean;
  } | null;
  /* Measured recent Transfer activity (capped eth_getLogs window) */
  recentTransfers: {
    count: number;
    fromBlock: number;
    toBlock: number;
  } | null;
  logoUrl: string | null;
  txCount: number | null;
  tokenTransfersCount: number | null;
  holders: number | null;
  known: boolean; // indexed verified market on this chain
  knownSymbol: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  riskFactors: string[];
  errors: string[];
  updatedAt: number;
}

function emptyResult(address: string, extra: Partial<ContractIntel>): ContractIntel {
  return {
    address,
    chainOnline: false,
    exists: null,
    isContract: null,
    contractType: null,
    tokenStandard: null,
    codeSizeBytes: null,
    isVerified: null,
    compiler: null,
    evmVersion: null,
    license: null,
    creator: null,
    deploymentTx: null,
    deployedAt: null,
    owner: null,
    name: null,
    symbol: null,
    decimals: null,
    totalSupplyRaw: null,
    nameSource: null,
    isProxy: null,
    implementation: null,
    adminAddress: null,
    market: null,
    recentTransfers: null,
    logoUrl: null,
    txCount: null,
    tokenTransfersCount: null,
    holders: null,
    known: false,
    knownSymbol: null,
    risk: "UNKNOWN",
    riskFactors: [],
    errors: [],
    updatedAt: Date.now(),
    ...extra,
  };
}

/** Tolerant single RPC probe — a failing method degrades to null, never crashes. */
async function probe<T>(task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch {
    return null;
  }
}

/** Decodes a raw supply (hex RPC result or decimal explorer string) with decimals. */
function decodeSupplyNumeric(raw: string, dec: number | null): number | null {
  if (!raw) return null;
  try {
    const big = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    const n = Number(big);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n / 10 ** (dec ?? 18);
  } catch {
    return null;
  }
}

/**
 * RECODE Scan - Robinhood Chain contract & token intelligence.
 * Every field is a verified fact from a configured source; failing probes
 * degrade to null. The verdict is NEVER "SAFE" and "UNKNOWN" is a
 * first-class outcome.
 */
export async function analyzeContract(address: string): Promise<ContractIntel> {
  const onchain = getOnchainProvider();
  const explorer = getExplorerProvider();
  const store = getSyncStore().get();
  const errors: string[] = [];
  const riskFactors: string[] = [];
  const addr = address.toLowerCase();

  /* 1. Check Robinhood Chain (existing configured RPC) */
  const chainIdHex = await onchain.chainId();
  const chainOnline = chainIdHex != null;
  if (!chainOnline) errors.push("RPC unreachable");

  /* 2. Read the code - decides contract vs EOA before token probes */
  const code = await onchain.codeInfo(addr);
  const exists = code != null;
  const isContract = code?.isContract ?? false;

  const knownEntry = Object.values(store.markets).find((m) => m.address === addr);
  const known = Boolean(knownEntry?.verified);

  if (!isContract) {
    return emptyResult(addr, {
      chainOnline,
      exists: false,
      isContract: false,
      contractType: "eoa",
      known,
      knownSymbol: knownEntry?.symbol ?? null,
      riskFactors: ["No contract code at this address on Robinhood Chain (wallet address)"],
      errors,
    });
  }

  /* 3. Type detection + proxy probes (tolerant, parallel) */
  const [nameRaw, symbolRaw, decimalsWord, supplyWord, implGetter, adminGetter, implSlot, adminSlot, erc721Meta, latest] =
    await Promise.all([
      probe(onchain.call(addr, SEL_NAME).then((h) => decodeAbiString(h))),
      probe(onchain.call(addr, SEL_SYMBOL).then((h) => decodeAbiString(h))),
      probe(onchain.call(addr, SEL_DECIMALS)),
      probe(onchain.call(addr, SEL_TOTAL_SUPPLY)),
      probe(onchain.call(addr, SEL_IMPLEMENTATION).then((h) => decodeAbiAddress(h))),
      probe(onchain.call(addr, SEL_ADMIN).then((h) => decodeAbiAddress(h))),
      probe(onchain.getStorageAt(addr, EIP1967_IMPL_SLOT).then((h) => decodeAbiAddress(h))),
      probe(onchain.getStorageAt(addr, EIP1967_ADMIN_SLOT).then((h) => decodeAbiAddress(h))),
      probe(onchain.supportsInterface(addr, ERC721_METADATA_ID)),
      probe(onchain.blockNumber()),
    ]);

  const decimalsWordN = decodeAbiUint(decimalsWord);
  const supplyWordN = decodeAbiUint(supplyWord);
  const decimals =
    decimalsWordN != null && decimalsWordN <= BigInt(255) ? Number(decimalsWordN) : null;
  const totalSupplyHex = supplyWordN != null ? `0x${supplyWordN.toString(16)}` : null;

  const isProxy =
    implSlot != null || implGetter != null || adminGetter != null || adminSlot != null;
  const implementation = implSlot ?? implGetter ?? null;
  const adminAddress = adminSlot ?? adminGetter ?? null;

  const hasErc20Shape = decimals != null && totalSupplyHex != null;
  const erc721ByShape =
    !hasErc20Shape && nameRaw != null && symbolRaw != null && decimals == null;
  const isErc20 = hasErc20Shape;
  const isErc721 = !isErc20 && (erc721Meta === true || erc721ByShape);
  const contractType: ScanContractType = isErc20
    ? "erc20"
    : isErc721
      ? "erc721"
      : isProxy
        ? "proxy"
        : "contract";

  /* 4. Explorer enrichment (creator, verification, counters) - degrades to
     null when the explorer is unreachable (current 403 challenge). */
  const [info, contractInfo] = await Promise.all([
    probe(explorer.addressInfo(addr)),
    probe(explorer.smartContract(addr)),
  ]);
  if (info == null) errors.push("Explorer data unavailable");

  /* 5. Ownership (owner() when implemented) */
  const owner = await probe(onchain.ownerOf(addr));

  /* 6. Token metadata - priority: registry > explorer > RPC probes */
  const name =
    knownEntry?.name?.replace(/\s*•\s*Robinhood Token\s*$/i, "").trim() ||
    info?.tokenName ||
    nameRaw ||
    null;
  const symbol = knownEntry?.symbol ?? info?.tokenSymbol ?? symbolRaw ?? null;
  const nameSource: ContractIntel["nameSource"] = name
    ? knownEntry
      ? "registry"
      : info?.tokenName
        ? "explorer"
        : "rpc"
    : null;

  /* 7. Market data - ONLY for indexed markets, ONLY verified values */
  const priceRow = store.prices[addr] ?? null;
  const supplyRawStr =
    totalSupplyHex ?? knownEntry?.totalSupply ?? info?.tokenTotalSupplyRaw ?? null;
  const supply = supplyRawStr
    ? decodeSupplyNumeric(
        supplyRawStr,
        decimals ?? knownEntry?.decimals ?? info?.tokenDecimals ?? null,
      )
    : null;
  const price = priceRow?.price ?? null;
  const fdv = price != null && supply != null && supply > 0 ? price * supply : null;
  const market: ContractIntel["market"] = known
    ? {
        price,
        change24hPct: priceRow?.change24hPct ?? null,
        marketCap: priceRow?.marketCap ?? null,
        fdv,
        volume24h: priceRow?.volume24h ?? null,
        liquidity: null,
        liquidityConfigured: false,
      }
    : null;

  /* 8. Measured recent Transfer activity (adaptive window, spaced retries —
     the parallel metadata probes can trip RPC throughput throttling, so
     each retry waits out the provider's backoff before firing). */
  let recentTransfers: ContractIntel["recentTransfers"] = null;
  if (latest != null && latest > 100) {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const [i, window] of [RECENT_LOG_WINDOW, 999, 99].entries()) {
      if (latest <= window) continue;
      if (i > 0) await wait(i === 1 ? 2_500 : 7_000);
      const rows = await probe(
        onchain.getLogs(addr, TRANSFER_TOPIC0, latest - window, latest),
      );
      if (rows != null) {
        recentTransfers = {
          count: rows.length,
          fromBlock: latest - window,
          toBlock: latest,
        };
        break;
      }
    }
    if (recentTransfers == null) errors.push("Recent activity probe unavailable");
  }

  /* 9. Risk - conservative rule-based verdict over available evidence */
  if (contractInfo?.isVerified === false) riskFactors.push("Source code not verified");
  if (info?.creator != null && info.creationTimestamp == null) {
    riskFactors.push("Deployment date unavailable");
  }
  if (owner != null && owner === addr) riskFactors.push("Contract owns itself");
  if (isProxy && implementation != null) {
    riskFactors.push(
      `Proxy contract - logic lives in implementation ${implementation.slice(0, 10)}...`,
    );
  }

  const hasEvidence = info != null || contractInfo != null;
  let risk: ContractIntel["risk"] = "UNKNOWN";
  if (known) {
    risk = "LOW";
  } else if (!hasEvidence) {
    risk = "UNKNOWN";
    riskFactors.push("Explorer unreachable - verification status cannot be established");
  } else if (contractInfo?.isVerified === true) {
    risk = "MEDIUM";
    riskFactors.push("Verified source, but not part of the indexed verified registry");
  } else {
    risk = "HIGH";
    riskFactors.push("Unverified contract outside the verified registry");
  }

  return {
    address: addr,
    chainOnline,
    exists,
    isContract,
    contractType,
    tokenStandard: isErc20 ? "ERC-20" : isErc721 ? "ERC-721" : null,
    codeSizeBytes: code?.sizeBytes ?? null,
    isVerified: contractInfo?.isVerified ?? null,
    compiler: contractInfo?.compiler ?? null,
    evmVersion: contractInfo?.evmVersion ?? null,
    license: contractInfo?.license ?? null,
    creator: info?.creator ?? null,
    deploymentTx: info?.creationTxHash ?? null,
    deployedAt: info?.creationTimestamp ?? null,
    owner,
    name,
    symbol,
    decimals,
    totalSupplyRaw:
      totalSupplyHex ?? knownEntry?.totalSupply ?? info?.tokenTotalSupplyRaw ?? null,
    nameSource,
    isProxy,
    implementation,
    adminAddress,
    market,
    recentTransfers,
    logoUrl: store.logos[addr]?.url ?? knownEntry?.logoUrl ?? null,
    txCount: info?.txCount ?? null,
    tokenTransfersCount: info?.tokenTransfersCount ?? null,
    holders: info?.holdersCount ?? null,
    known,
    knownSymbol: knownEntry?.symbol ?? null,
    risk,
    riskFactors,
    errors,
    updatedAt: Date.now(),
  };
}
