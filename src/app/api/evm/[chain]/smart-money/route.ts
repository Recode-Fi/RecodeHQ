import { NextResponse } from "next/server";
import { getEvmNetEngine, parseEvmNetChain } from "@/server/evmnet/registry";
import { evmNetSmartMoney } from "@/server/evmnet/services/smartMoney";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const key = parseEvmNetChain(chain);
  if (!key) {
    return NextResponse.json({ status: "error", data: null, error: "Unknown EVM net chain" }, { status: 404 });
  }
  const engine = getEvmNetEngine(key);
  engine.ensureStarted();
  const url = new URL(req.url);
  const windowHours = Math.min(
    720,
    Math.max(1, Number(url.searchParams.get("windowHours") ?? 24) || 24),
  );
  const wallets = evmNetSmartMoney(key, windowHours);
  return NextResponse.json({
    status: "live",
    data: wallets,
    ...(wallets.length === 0
      ? {
          error:
            "No verified stablecoin flow events in this window yet — the engine scans recent blocks continuously.",
        }
      : {}),
  });
}