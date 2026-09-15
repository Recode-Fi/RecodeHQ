/**
 * ============================================================
 * RECODE Agent — shared types
 * ============================================================
 * The agent is a server-side orchestration layer that reuses
 * the existing RECODE services (sync store, scanner, wallet,
 * whale intelligence). It never owns a second data pipeline.
 */

/* ── Normalized conversation ─────────────────────────────── */

export type NormalizedMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface ToolCallRequest {
  id: string;
  name: string;
  /** Raw JSON arguments string from the provider. */
  arguments: string;
  /**
   * Gemini 3 thought signature arriving with this function call
   * (OpenAI-compat wire path: tool_calls[].extra_content.google.
   * thought_signature). It MUST be preserved and replayed with the
   * assistant tool-call turn — dropping it makes Gemini reject the
   * follow-up request with HTTP 400 "Function call is missing a
   * thought_signature in functionCall parts."
   */
  thoughtSignature?: string;
}

/* ── Tool layer ──────────────────────────────────────────── */

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
  /** OpenAPI-style enum hint (string tools only). */
  enum?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(args: Record<string, unknown>): Promise<unknown>;
}

/* ── Provider abstraction ────────────────────────────────── */

export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool_call"; call: ToolCallRequest }
  | { type: "end"; finishReason: string | null };

/** Explicit thinking control (auto → provider/model default). */
export type ThinkingLevel = "auto" | "none" | "minimal" | "low" | "medium" | "high";

export interface ChatParams {
  messages: NormalizedMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
  maxTokens?: number;
  /** Omitted/“auto” means: do not send any thinking parameter. */
  thinkingLevel?: ThinkingLevel;
}

/** Minimal streaming chat interface every RECODE Agent backend implements. */
export interface RecodeAgentProvider {
  readonly name: string;
  chat(params: ChatParams): AsyncGenerator<ProviderEvent>;
}

/* ── Page context (client → server) ──────────────────────── */

/** Compact snapshot of what the user is currently looking at. */
export interface AgentPageContext {
  /** One of: markets | asset | scanner | wallet | whales | radar | signals | other */
  page: string;
  /** Current route, e.g. /app/app/asset/NVDA */
  route: string;
  /** Only fields that are actually available — absent keys are unknown. */
  asset?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  wallet?: { address?: string } & Record<string, unknown>;
  whale?: Record<string, unknown>;
  signals?: Record<string, unknown>;
  /** Compact cross-market snapshot (markets/radar pages). */
  markets?: Record<string, unknown>;
  /** Free-form note from the page (e.g. active tab). */
  note?: string;
}

/* ── Agent stream events (server → client) ───────────────── */

export type AgentEvent =
  | { type: "status"; stage: "thinking" | "tools"; round: number }
  | { type: "thought"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_done"; name: string; ok: boolean; summary: string }
  | { type: "token"; text: string }
  | { type: "done"; finishReason: string | null; rounds: number }
  | { type: "error"; message: string; code: string };

export const PROVENANCE_LABELS = [
  "LIVE",
  "CALCULATED",
  "HISTORICAL",
  "UNKNOWN",
  "UNAVAILABLE",
] as const;

export type Provenance = (typeof PROVENANCE_LABELS)[number];
