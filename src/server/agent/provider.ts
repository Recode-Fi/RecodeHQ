import type {
  ChatParams,
  NormalizedMessage,
  ProviderEvent,
  RecodeAgentProvider,
  ToolDef,
  ToolCallRequest,
} from "./types";
import { agentConfig, type AgentConfig } from "./config";

/**
 * ============================================================
 * RECODE Agent — provider abstraction
 * ============================================================
 * Two streaming implementations behind one interface:
 *   • OpenAICompatibleProvider — /chat/completions with tools
 *     (covers OpenAI and any OpenAI-compatible endpoint).
 *   • AnthropicProvider — /v1/messages with tool_use blocks.
 * Both are plain fetch + SSE; no AI SDK dependency.
 * Messages arrive normalized and are mapped to wire format here.
 */

/* ── Wire-format mapping helpers ─────────────────────────── */

type OpenAiWireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAiMessages(messages: NormalizedMessage[]): OpenAiWireMessage[] {
  return messages.map((m) => {
    switch (m.role) {
      case "system":
      case "user":
        return { role: m.role, content: m.content };
      case "tool":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      default: {
        // Thought summaries are stream-only scaffolding — they are never
        // replayed as assistant content. The thought SIGNATURE, however,
        // must survive: it is attached back onto the tool_call below.
        const wire: OpenAiWireMessage = { role: "assistant", content: stripThoughts(m.content) || null };
        if (m.toolCalls?.length) {
          wire.tool_calls = m.toolCalls.map((c) => {
            const tc: Record<string, unknown> = {
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.arguments },
            };
            if (c.thoughtSignature) {
              // Gemini 3 requires the original signature on the replayed
              // function-call part, verbatim — never fabricated or regenerated.
              tc.extra_content = { google: { thought_signature: c.thoughtSignature } };
            }
            return tc;
          });
        }
        return wire;
      }
    }
  });
}

/**
 * Remove Gemini thought-summary markup from finished assistant text before
 * replay. Handles unclosed tags defensively; the stream parser has already
 * separated thoughts from answers for live display.
 */
export function stripThoughts(text: string | null): string {
  if (!text) return "";
  return text
    .replace(/<thought>[\s\S]*?<\/thought>/g, "")
    .replace(/<thought>[\s\S]*$/g, "")
    .replace(/<\/thought>/g, "")
    .trim();
}

/**
 * Splits streamed Gemini OpenAI-compat content into thought summaries and
 * answer text. Verified live wire format (gemini-3.x, include_thoughts):
 *   • summaries arrive INLINE in delta.content inside literal
 *     `<thought>…</thought>` tags, and
 *   • the opening chunk carries delta.extra_content.google.thought === true.
 * Tags (or the answer following a closing tag) can be split across chunk
 * boundaries, so partial-tag tails are held back between chunks.
 */
export class ThoughtSplitter {
  private inThought = false;
  private carry = "";

  private static partialTagLen(s: string, tag: string): number {
    const max = Math.min(tag.length - 1, s.length);
    for (let n = max; n > 0; n--) {
      if (tag.startsWith(s.slice(s.length - n))) return n;
    }
    return 0;
  }

  split(chunkText: string): { thought: string; answer: string; sawTags: boolean } {
    let buf = this.carry + chunkText;
    this.carry = "";
    let thought = "";
    let answer = "";
    let sawTags = false;
    for (;;) {
      if (!this.inThought) {
        const open = buf.indexOf("<thought>");
        if (open === -1) {
          const tail = ThoughtSplitter.partialTagLen(buf, "<thought>");
          if (tail > 0) {
            this.carry = buf.slice(buf.length - tail);
            answer += buf.slice(0, buf.length - tail);
          } else {
            answer += buf;
          }
          break;
        }
        sawTags = true;
        answer += buf.slice(0, open);
        buf = buf.slice(open + "<thought>".length);
        this.inThought = true;
      } else {
        const close = buf.indexOf("</thought>");
        if (close === -1) {
          const tail = ThoughtSplitter.partialTagLen(buf, "</thought>");
          if (tail > 0) {
            this.carry = buf.slice(buf.length - tail);
            thought += buf.slice(0, buf.length - tail);
          } else {
            thought += buf;
          }
          break;
        }
        sawTags = true;
        thought += buf.slice(0, close);
        buf = buf.slice(close + "</thought>".length);
        this.inThought = false;
      }
    }
    return { thought, answer, sawTags };
  }

  /** Flush text held back at the end of the stream. */
  flush(): { thought: string; answer: string } {
    const rest = this.carry;
    this.carry = "";
    return this.inThought ? { thought: rest, answer: "" } : { thought: "", answer: rest };
  }
}

function toOpenAiTools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: jsonSchemaFor(t),
    },
  }));
}

export function jsonSchemaFor(tool: ToolDef): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = {
      type: p.type,
      description: p.description,
      ...(p.enum ? { enum: p.enum } : {}),
    };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

/* ── SSE line reader ─────────────────────────────────────── */

async function* sseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error("Provider response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ── OpenAI-compatible provider ──────────────────────────── */

interface OpenAiStreamChunk {
  choices?: {
    delta?: {
      content?: string | null;
      /* Gemini OpenAI-compat provider-specific metadata — never discarded. */
      extra_content?: {
        google?: { thought?: boolean; thought_signature?: string };
      } | null;
      tool_calls?: {
        index?: number;
        id?: string | null;
        function?: { name?: string | null; arguments?: string | null };
        /* Thought signature accompanies the FIRST function-call part. */
        extra_content?: { google?: { thought_signature?: string } } | null;
      }[];
      /* Legacy non-indexed function-call delta (older wire format). */
      function_call?: { name?: string | null; arguments?: string | null } | null;
    } | null;
    finish_reason?: string | null;
  }[];
  error?: { message?: string } | null;
}

export class OpenAICompatibleProvider implements RecodeAgentProvider {
  readonly name = "openai-compatible";

  private readonly googleCompat: boolean;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.googleCompat = baseUrl.includes("generativelanguage.googleapis.com");
  }

  /**
   * Thinking configuration, per the official Gemini OpenAI-compatibility
   * documentation: reasoning_effort and thinking_level overlap and must
   * never be sent together. On Google's endpoint thought summaries are
   * enabled via extra_body.google.thinking_config.include_thoughts and the
   * level via thinking_level; "none" (disable thinking, 2.5 models only)
   * is expressed with reasoning_effort. On vanilla OpenAI an explicit
   * level maps to the standard reasoning_effort parameter and is only
   * ever sent when the operator explicitly configured one.
   */
  private thinkingParams(level?: string): Record<string, unknown> {
    if (!level || level === "auto") return {};
    if (this.googleCompat) {
      if (level === "none") return { reasoning_effort: "none" };
      return {
        extra_body: {
          google: { thinking_config: { include_thoughts: true, thinking_level: level } },
        },
      };
    }
    if (level === "none") return {};
    return { reasoning_effort: level };
  }

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new Error("Provider request timed out")),
      this.timeoutMs,
    );
    params.signal?.addEventListener(
      "abort",
      () => ctrl.abort(params.signal?.reason),
      { once: true },
    );
    try {
      const reqBody: Record<string, unknown> = {
        model: this.model,
        stream: true,
        messages: toOpenAiMessages(params.messages),
        tools: params.tools.length ? toOpenAiTools(params.tools) : undefined,
        max_tokens: params.maxTokens,
        temperature: 0.2,
        ...this.thinkingParams(params.thinkingLevel),
      };
      if (process.env.RECODE_AGENT_DEBUG) {
        /* Debug hook: dumps the wire request with signatures redacted to
           lengths — never the API key. Enable with RECODE_AGENT_DEBUG=1.
           RECODE_AGENT_DEBUG=2 additionally persists the exact request body
           (signature intact, model metadata — NOT a secret) to
           .recode-debug-last-request.json for offline wire-format debugging. */
        const redacted = JSON.parse(JSON.stringify(reqBody)) as Record<string, unknown>;
        const msgs = redacted.messages as Record<string, unknown>[] | undefined;
        if (msgs) {
          for (const m of msgs) {
            const tcs = m.tool_calls as Record<string, unknown>[] | undefined;
            if (tcs) {
              for (const tc of tcs) {
                const ec = tc.extra_content as
                  | { google?: { thought_signature?: string } }
                  | undefined;
                if (ec?.google?.thought_signature) {
                  ec.google.thought_signature = `<sig len=${ec.google.thought_signature.length}>`;
                }
              }
            }
          }
        }
        console.error(`[recode-agent][debug] wire request: ${JSON.stringify(redacted)}`);
        if (process.env.RECODE_AGENT_DEBUG === "2") {
          try {
            const fs = await import("node:fs");
            fs.writeFileSync(
              ".recode-debug-last-request.json",
              JSON.stringify(reqBody, null, 1),
              "utf8",
            );
          } catch {
            /* debug-only */
          }
        }
      }
      let res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(reqBody),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const firstStatus = res.status;
        await res.text().catch(() => "");
        /* Verified in production: Gemini intermittently rejects an
           otherwise-valid request with 400 INVALID_ARGUMENT — the identical
           body succeeds on immediate replay. These requests are stateless,
           so one identical retry with a short backoff is safe. */
        if (
          firstStatus === 400 ||
          firstStatus === 408 ||
          firstStatus === 429 ||
          firstStatus >= 500
        ) {
          await new Promise((r) => setTimeout(r, 750));
          res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
            body: JSON.stringify(reqBody),
            signal: ctrl.signal,
          });
          if (process.env.RECODE_AGENT_DEBUG) {
            console.error(
              `[recode-agent][debug] provider HTTP ${firstStatus} on attempt 1 → retry → HTTP ${res.status}`,
            );
          }
        }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Provider error ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        );
      }

      // Tool-call arguments arrive fragmented across chunks. OpenAI streams
      // fragments keyed by `index`; Gemini's OpenAI-compat layer, however,
      // can emit PARALLEL complete calls that REUSE the same index — so a
      // chunk carrying its own `id` must start (or continue) that specific
      // call, never be merged into a different one. The old index-only
      // merge corrupted parallel calls into `{"a":1}{"a":1}` argument
      // strings (Gemini then rejects the replay with 400 INVALID_ARGUMENT)
      // and silently dropped the extra calls and their thought signatures.
      const parts = new Map<
        string,
        { order: number; id: string; name: string; arguments: string; signature: string | null }
      >();
      const lastByIndex = new Map<
        number,
        { order: number; id: string; name: string; arguments: string; signature: string | null }
      >();
      let seq = 0;
      let legacy: { name: string; arguments: string } | null = null;
      let finish: string | null = null;
      const splitter = new ThoughtSplitter();
      for await (const data of sseLines(res)) {
        if (!data || data === "[DONE]") continue;
        let chunk: OpenAiStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAiStreamChunk;
        } catch {
          continue;
        }
        if (chunk.error?.message) throw new Error(`Provider error: ${chunk.error.message}`);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        /* Thought summaries stream inline inside <thought>…</thought> tags
           in delta.content; the opening chunk is additionally marked with
           delta.extra_content.google.thought === true. */
        const markedThought = choice.delta?.extra_content?.google?.thought === true;
        const raw = choice.delta?.content;
        if (raw) {
          const seg = splitter.split(raw);
          if (markedThought && !seg.sawTags) {
            /* Marker without literal tags — the whole segment is thought. */
            const t = seg.thought + seg.answer;
            if (t) yield { type: "thought", text: t };
          } else {
            if (seg.thought) yield { type: "thought", text: seg.thought };
            if (seg.answer) yield { type: "text", text: seg.answer };
          }
        }

        for (const tc of choice.delta?.tool_calls ?? []) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          const sig = tc.extra_content?.google?.thought_signature;
          let part = lastByIndex.get(idx);
          if (tc.id) {
            /* Chunk identifies its own call — locate it by id across all
               parts, or start it. Never merge two different ids. */
            if (part && part.id && part.id !== tc.id) part = undefined;
            if (!part) {
              for (const p of Array.from(parts.values())) {
                if (p.id === tc.id) { part = p; break; }
              }
            }
            if (!part) {
              part = { order: seq++, id: tc.id, name: "", arguments: "", signature: null };
              parts.set(`id:${tc.id}:${idx}`, part);
            }
            part.id = tc.id;
          } else if (!part) {
            /* Continuation fragment with no prior call on this index. */
            part = { order: seq++, id: "", name: "", arguments: "", signature: null };
            parts.set(`idx:${idx}:${seq - 1}`, part);
          }
          if (tc.function?.name && !part.name) part.name = tc.function.name;
          if (tc.function?.arguments) part.arguments += tc.function.arguments;
          if (typeof sig === "string" && sig) part.signature = sig;
          lastByIndex.set(idx, part);
        }

        /* Legacy un-indexed function_call delta (no tool_calls array). */
        const fc = choice.delta?.function_call;
        if (fc) {
          legacy ??= { name: "", arguments: "" };
          if (fc.name) legacy.name += fc.name;
          if (fc.arguments) legacy.arguments += fc.arguments;
        }

        if (choice.finish_reason) finish = choice.finish_reason;
      }

      /* Flush anything the splitter held back at the final chunk boundary. */
      const tail = splitter.flush();
      if (tail.thought) yield { type: "thought", text: tail.thought };
      if (tail.answer) yield { type: "text", text: tail.answer };

      const orderedParts = Array.from(parts.values()).sort((a, b) => a.order - b.order);
      for (const part of orderedParts) {
        const call: ToolCallRequest = { id: part.id, name: part.name, arguments: part.arguments };
        if (part.signature) call.thoughtSignature = part.signature;
        if (call.id && call.name) yield { type: "tool_call", call };
      }
      if (legacy && legacy.name) {
        yield {
          type: "tool_call",
          call: { id: "call_legacy_0", name: legacy.name, arguments: legacy.arguments || "{}" },
        };
      }
      yield { type: "end", finishReason: finish };
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ── Anthropic provider ──────────────────────────────────── */

type AnthropicWireBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicMessages(messages: NormalizedMessage[]): {
  system: string | null;
  messages: { role: "user" | "assistant"; content: AnthropicWireBlock[] }[];
} {
  const systemParts: string[] = [];
  const out: { role: "user" | "assistant"; content: AnthropicWireBlock[] }[] = [];
  for (const m of messages) {
    switch (m.role) {
      case "system":
        systemParts.push(m.content);
        continue;
      case "user":
        out.push({ role: "user", content: [{ type: "text", text: m.content }] });
        continue;
      case "tool":
        out.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
        });
        continue;
      default:
        break;
    }
    const blocks: AnthropicWireBlock[] = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const c of m.toolCalls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(c.arguments || "{}") as unknown;
      } catch {
        input = {};
      }
      blocks.push({ type: "tool_use", id: c.id, name: c.name, input });
    }
    out.push({
      role: "assistant",
      content: blocks.length ? blocks : [{ type: "text", text: "" }],
    });
  }
  return { system: systemParts.length ? systemParts.join("\n\n") : null, messages: out };
}

interface AnthropicStreamEvent {
  type?: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  error?: { message?: string } | null;
}

export class AnthropicProvider implements RecodeAgentProvider {
  readonly name = "anthropic";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new Error("Provider request timed out")),
      this.timeoutMs,
    );
    params.signal?.addEventListener(
      "abort",
      () => ctrl.abort(params.signal?.reason),
      { once: true },
    );
    try {
      const { system, messages } = toAnthropicMessages(params.messages);
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          max_tokens: params.maxTokens,
          temperature: 0.2,
          ...(system ? { system } : {}),
          messages,
          tools: params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: jsonSchemaFor(t),
          })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Provider error ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        );
      }

      // Reassemble tool_use inputs from input_json_delta fragments.
      const blocks = new Map<number, { id: string; name: string; json: string }>();
      let stopReason: string | null = null;
      for await (const data of sseLines(res)) {
        if (!data) continue;
        let ev: AnthropicStreamEvent;
        try {
          ev = JSON.parse(data) as AnthropicStreamEvent;
        } catch {
          continue;
        }
        if (ev.error?.message) throw new Error(`Provider error: ${ev.error.message}`);
        if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
          blocks.set(ev.index ?? 0, {
            id: ev.content_block.id ?? "",
            name: ev.content_block.name ?? "",
            json: "",
          });
          continue;
        }
        if (ev.type === "content_block_delta") {
          if (ev.delta?.type === "text_delta" && ev.delta.text) {
            yield { type: "text", text: ev.delta.text };
          } else if (ev.delta?.type === "input_json_delta" && ev.delta.partial_json) {
            const b = blocks.get(ev.index ?? 0);
            if (b) b.json += ev.delta.partial_json;
          }
          continue;
        }
        if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stopReason = ev.delta.stop_reason;
        }
      }

      for (const [, b] of blocks) {
        if (!b.id || !b.name) continue;
        yield { type: "tool_call", call: { id: b.id, name: b.name, arguments: b.json || "{}" } };
      }
      yield { type: "end", finishReason: stopReason };
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ── Factory ─────────────────────────────────────────────── */

/**
 * Provider factory. Gemini uses Google's OFFICIAL OpenAI-compatible
 * endpoint (https://generativelanguage.googleapis.com/v1beta/openai —
 * Bearer auth, streaming SSE and function calling in OpenAI wire
 * format), so it reuses OpenAICompatibleProvider unchanged.
 */
export function createProvider(cfg: AgentConfig = agentConfig()): RecodeAgentProvider | null {
  if (!cfg.apiKey) return null;
  return cfg.provider === "anthropic"
    ? new AnthropicProvider(cfg.baseUrl, cfg.apiKey, cfg.model, cfg.requestTimeoutMs)
    : new OpenAICompatibleProvider(cfg.baseUrl, cfg.apiKey, cfg.model, cfg.requestTimeoutMs);
}


