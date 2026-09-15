import type {
  AgentEvent,
  AgentPageContext,
  NormalizedMessage,
  ToolCallRequest,
} from "./types";
import { agentConfig } from "./config";
import { createProvider } from "./provider";
import { AGENT_TOOLS, clampToolResult, toolByName } from "./tools";
import { contextBlock, systemPrompt } from "./system-prompt";

/**
 * RECODE Agent — orchestration loop
 * ============================================================
 * One user turn: stream provider events, execute tool calls
 * against the RECODE tool layer, feed results back, repeat
 * (bounded), and stream the final synthesis as text deltas.
 * The generator yields AgentEvents consumed by the SSE route.
 *
 * Error boundary: every failure (provider, network, timeout,
 * tool execution, parsing) is logged in full detail server-side
 * and normalized into one user-safe message before it can ever
 * reach the client.
 */

/** The ONLY error text a user may ever see from the agent. */
export const USER_SAFE_ERROR = "Server is busy. Please try again shortly.";

/** Normalized error shape — internalMessage stays in server logs only. */
export interface RecodeAgentError {
  code: string;
  internalMessage: string;
  userMessage: string;
}

function normalizeError(scope: string, e: unknown): RecodeAgentError {
  const internalMessage = e instanceof Error ? (e.stack ?? e.message) : String(e);
  /* Server-side log keeps everything: status codes, provider bodies, sockets. */
  console.error(`[recode-agent] ${scope}:`, internalMessage);
  return { code: "AGENT_BUSY", internalMessage, userMessage: USER_SAFE_ERROR };
}

/** Public chat history shape accepted from the client. */
export interface ClientChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_TOOL_ROUNDS_DEFAULT = 8;

function summarizeToolResult(name: string, value: unknown): string {
  try {
    const v = value as Record<string, unknown>;
    /* Failures NEVER leak their raw cause to the user-facing chip. */
    if (v?.error) return `${name}: temporarily unavailable`;
    const prov = v?.provenance ? ` [${String(v.provenance)}]` : "";
    const keys = v ? Object.keys(v).length : 0;
    return `${name}: ok (${keys} fields)${prov}`;
  } catch {
    return `${name}: ok`;
  }
}

export async function* runAgentTurn(options: {
  history: ClientChatMessage[];
  message: string;
  context: AgentPageContext | null;
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const cfg = agentConfig();
  const provider = createProvider(cfg);

  /* Unconfigured → clear, honest error (no fake answers). */
  if (!provider) {
    yield {
      type: "error",
      code: "AGENT_NOT_CONFIGURED",
      message:
        "RECODE Agent is not configured yet. Add GEMINI_API_KEY (or RECODE_AGENT_API_KEY, plus " +
        "optional RECODE_AGENT_PROVIDER, RECODE_AGENT_BASE_URL, RECODE_AGENT_MODEL) to the " +
        "environment, then redeploy. The agent stays fully functional afterwards.",
    };
    return;
  }

  /* Build the normalized conversation. */
  const messages: NormalizedMessage[] = [{ role: "system", content: systemPrompt() }];
  const ctxJson = contextBlock(options.context);
  const userText = options.message.trim();
  const userContent = ctxJson ? `${ctxJson}\n\nUSER: ${userText}` : userText;

  const cappedHistory = options.history.slice(-12);
  for (const m of cappedHistory) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: userContent });

  let rounds = 0;
  const maxRounds = cfg.maxToolRounds || MAX_TOOL_ROUNDS_DEFAULT;

  for (;;) {
    rounds += 1;
    const isFinalCap = rounds > maxRounds;
    yield { type: "status", stage: rounds === 1 ? "thinking" : "tools", round: rounds };

    let text = "";
    const calls: ToolCallRequest[] = [];
    let finish: string | null = null;

    try {
      for await (const ev of provider.chat({
        messages,
        tools: isFinalCap ? [] : AGENT_TOOLS,
        signal: options.signal,
        maxTokens: cfg.maxTokens,
        thinkingLevel: cfg.thinkingLevel === "auto" ? undefined : cfg.thinkingLevel,
      })) {
        if (ev.type === "text") {
          text += ev.text;
          yield { type: "token", text: ev.text };
        } else if (ev.type === "thought") {
          /* Gemini thought summaries — forwarded for the thinking UI. */
          yield { type: "thought", text: ev.text };
        } else if (ev.type === "tool_call") {
          calls.push(ev.call);
        } else {
          finish = ev.finishReason;
        }
      }
    } catch (e) {
      if (options.signal?.aborted) {
        yield { type: "done", finishReason: "aborted", rounds };
        return;
      }
      /* Provider / network / timeout / HTTP 4xx-5xx / socket / parse
         failures all normalize here. Full detail → server log only. */
      const err = normalizeError("provider stream failed", e);
      yield { type: "error", code: err.code, message: err.userMessage };
      return;
    }

    if (options.signal?.aborted) {
      yield { type: "done", finishReason: "aborted", rounds };
      return;
    }

    /* No tool calls → the turn is complete. */
    if (calls.length === 0 || isFinalCap) {
      yield { type: "done", finishReason: finish ?? (isFinalCap ? "max_rounds" : "stop"), rounds };
      return;
    }

    /* Record the assistant tool-call turn, then execute each tool. */
    messages.push({ role: "assistant", content: text || null, toolCalls: calls });

    for (const call of calls) {
      const tool = toolByName(call.name);
      let args: Record<string, unknown> = {};
      try {
        args = (JSON.parse(call.arguments || "{}") as Record<string, unknown>) ?? {};
      } catch {
        /* malformed arguments → tool reports the error */
      }
      yield { type: "tool_start", name: call.name, args };

      let resultJson: string;
      let ok = true;
      if (!tool) {
        ok = false;
        console.error(`[recode-agent] tool dispatch: unknown tool "${call.name}"`);
        resultJson = JSON.stringify({
          error: "Tool temporarily unavailable — inform the user the server is busy and to try again shortly.",
          provenance: "UNAVAILABLE",
        });
      } else {
        try {
          const result = await tool.execute(args);
          resultJson = clampToolResult(result);
        } catch (e) {
          /* Tool execution failure: raw cause → server log; the model and
             the UI only ever see the normalized safe wording. */
          normalizeError(`tool "${call.name}" failed`, e);
          ok = false;
          resultJson = JSON.stringify({
            error: "Tool temporarily unavailable — inform the user the server is busy and to try again shortly.",
            provenance: "UNAVAILABLE",
          });
        }
      }

      yield { type: "tool_done", name: call.name, ok, summary: summarizeToolResult(call.name, ok ? resultJson : { error: resultJson }) };
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: resultJson,
      });
    }
  }
}
