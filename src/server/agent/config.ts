/**
 * ============================================================
 * RECODE Agent — environment configuration (server-side only)
 * ============================================================
 * The API key is added later (locally via .env.local, in
 * production via the Vercel project settings). Without a key
 * the agent endpoint answers with a clear "unconfigured"
 * event — the rest of the app is unaffected.
 */

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Explicit thinking control for thinking-capable models (Gemini 2.5/3). */
const THINKING_LEVELS = ["auto", "none", "minimal", "low", "medium", "high"] as const;
export type AgentThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface AgentConfig {
  /** "openai" (any OpenAI-compatible endpoint), "anthropic", or "gemini". */
  provider: "openai" | "anthropic" | "gemini";
  apiKey: string | null;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  maxToolRounds: number;
  requestTimeoutMs: number;
  thinkingLevel: AgentThinkingLevel;
}

export function agentConfig(): AgentConfig {
  const rawProvider = (process.env.RECODE_AGENT_PROVIDER ?? "auto").trim().toLowerCase();
  const explicitBase = process.env.RECODE_AGENT_BASE_URL?.trim() || null;
  const explicitModel = process.env.RECODE_AGENT_MODEL?.trim() || null;

  /**
   * Key resolution — GEMINI_API_KEY is the documented Gemini source;
   * RECODE_AGENT_API_KEY remains the generic override. An explicit
   * RECODE_AGENT_PROVIDER=gemini prefers GEMINI_API_KEY; with "auto"
   * a GEMINI_API_KEY alone activates the Gemini backend.
   */
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || null;
  const genericKey = process.env.RECODE_AGENT_API_KEY?.trim() || null;

  let provider: AgentConfig["provider"];
  if (rawProvider === "gemini") provider = "gemini";
  else if (rawProvider === "anthropic") provider = "anthropic";
  else if (rawProvider === "openai") provider = "openai";
  else provider = explicitBase?.includes("anthropic") ? "anthropic" : "openai";

  let apiKey = genericKey;
  if (rawProvider === "gemini") apiKey = geminiKey ?? genericKey;
  else if (rawProvider === "auto" && !apiKey && geminiKey) {
    provider = "gemini";
    apiKey = geminiKey;
  }

  const baseUrl =
    explicitBase ??
    (provider === "anthropic"
      ? "https://api.anthropic.com"
      : provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/openai"
        : "https://api.openai.com/v1");

  const model =
    explicitModel ??
    (provider === "anthropic"
      ? "claude-sonnet-4-20250514"
      : provider === "gemini"
        ? "gemini-2.5-flash"
        : "gpt-4o-mini");

  const rawThinking = (process.env.RECODE_AGENT_THINKING_LEVEL ?? "auto").trim().toLowerCase();
  const thinkingLevel: AgentThinkingLevel = (THINKING_LEVELS as readonly string[]).includes(rawThinking)
    ? (rawThinking as AgentThinkingLevel)
    : "auto";

  return {
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    maxTokens: num(process.env.RECODE_AGENT_MAX_TOKENS, 2048),
    temperature: 0.2,
    maxToolRounds: num(process.env.RECODE_AGENT_MAX_TOOL_ROUNDS, 8),
    requestTimeoutMs: num(process.env.RECODE_AGENT_REQUEST_TIMEOUT_MS, 120_000),
    thinkingLevel,
  };
}

/** True when the agent backend is fully configured (key present). */
export function isAgentConfigured(): boolean {
  return agentConfig().apiKey != null;
}
