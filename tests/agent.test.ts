import { describe, expect, it, vi, afterEach } from "vitest";
import { AGENT_TOOLS } from "@/server/agent/tools";
import { jsonSchemaFor } from "@/server/agent/provider";
import { contextBlock, systemPrompt } from "@/server/agent/system-prompt";
import { createProvider } from "@/server/agent/provider";
import { agentConfig } from "@/server/agent/config";
import { OpenAICompatibleProvider } from "@/server/agent/provider";
import { runAgentTurn, USER_SAFE_ERROR } from "@/server/agent/agent";
import type { ToolDef } from "@/server/agent/types";

const SPEC_TOOLS = [
  "getMarketData",
  "getHistoricalMarketData",
  "getAssetIntelligence",
  "scanContract",
  "getTokenMetadata",
  "getTokenHolders",
  "getTopHolders",
  "getWhaleActivity",
  "getWalletIntelligence",
  "getWalletBalances",
  "getRecentTransfers",
  "getTokenLiquidity",
  "getNetworkStatus",
  "getContractVerification",
  "getDeploymentInfo",
];

describe("AGENT_TOOLS — registry integrity", () => {
  it("exposes every tool required by the spec", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    for (const required of SPEC_TOOLS) {
      expect(names).toContain(required);
    }
  });

  it("has unique names, real descriptions and executable handlers", () => {
    const names = new Set<string>();
    for (const tool of AGENT_TOOLS) {
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(typeof tool.execute).toBe("function");
      for (const p of tool.parameters) {
        expect(["string", "number", "boolean"]).toContain(p.type);
      }
    }
  });
});

const sampleTool: ToolDef = {
  name: "sample",
  description: "sample tool",
  parameters: [
    { name: "symbol", type: "string", description: "the symbol", required: true },
    { name: "kind", type: "string", description: "filter", enum: ["all", "buy"] },
    { name: "limit", type: "number", description: "max rows" },
  ],
  execute: async () => ({}),
};

describe("jsonSchemaFor — provider-agnostic tool schemas", () => {
  it("maps parameters into a JSON schema with required list and enums", () => {
    const schema = jsonSchemaFor(sampleTool);
    expect(schema.type).toBe("object");
    expect(schema.properties.symbol).toMatchObject({ type: "string", description: "the symbol" });
    expect(schema.properties.kind).toMatchObject({ enum: ["all", "buy"] });
    expect(schema.required).toEqual(["symbol"]);
  });

  it("produces an empty required list when nothing is mandatory", () => {
    expect(jsonSchemaFor({ ...sampleTool, parameters: [] }).required).toEqual([]);
  });
});

describe("contextBlock — only available data is passed", () => {
  it("returns null when there is no meaningful context", () => {
    expect(contextBlock(null)).toBeNull();
    expect(contextBlock({ page: "other", route: "/app/app/portfolio" })).toBeNull();
  });

  it("serializes the sections that actually hold data and drops empty ones", () => {
    const block = contextBlock({
      page: "asset",
      route: "/app/app/asset/NVDA",
      asset: { symbol: "NVDA", price: 700, change24hPct: null },
      contract: {},
    }) as string;
    expect(block).toContain("page: asset");
    expect(block).toContain('"symbol":"NVDA"');
    expect(block).toContain('"price":700');
    expect(block).toContain('"change24hPct":null'); // null stays null — never dropped into 0
    expect(block).not.toContain("contract:");
  });
});

describe("system prompt — data integrity contract", () => {
  it("forbids fabrication, null→0 and unproven BUY/SELL classification", () => {
    const p = systemPrompt();
    expect(p).toMatch(/Never invent|never invent/i);
    expect(p).toMatch(/null/i);
    expect(p).toMatch(/TRANSFER/);
    expect(p).toContain("LIVE");
    expect(p).toContain("UNAVAILABLE");
  });
});

describe("provider factory — key-less state is explicit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null without an API key (never a fake provider)", () => {
    vi.stubEnv("RECODE_AGENT_API_KEY", "");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "auto");
    vi.stubEnv("RECODE_AGENT_BASE_URL", "");
    expect(createProvider(agentConfig())).toBeNull();
  });

  it("builds an OpenAI-compatible provider from a key (default endpoint)", () => {
    vi.stubEnv("RECODE_AGENT_API_KEY", "sk-test");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "openai");
    vi.stubEnv("RECODE_AGENT_BASE_URL", "");
    const p = createProvider(agentConfig());
    expect(p?.name).toBe("openai-compatible");
  });

  it("auto-detects Anthropic from the base URL", () => {
    vi.stubEnv("RECODE_AGENT_API_KEY", "ak-test");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "auto");
    vi.stubEnv("RECODE_AGENT_BASE_URL", "https://api.anthropic.com");
    const p = createProvider(agentConfig());
    expect(p?.name).toBe("anthropic");
  });
});

describe("Gemini backend — GEMINI_API_KEY activation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explicit provider=gemini reads GEMINI_API_KEY and targets Google's OpenAI-compatible endpoint", () => {
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "gemini");
    const cfg = agentConfig();
    expect(cfg.provider).toBe("gemini");
    expect(cfg.apiKey).toBe("g-test");
    expect(cfg.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(cfg.model).toBe("gemini-2.5-flash");
    const p = createProvider(cfg);
    expect(p?.name).toBe("openai-compatible"); // Gemini speaks the OpenAI wire format
  });

  it("a GEMINI_API_KEY alone activates Gemini under auto detection", () => {
    vi.stubEnv("GEMINI_API_KEY", "g-auto");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "auto");
    const cfg = agentConfig();
    expect(cfg.provider).toBe("gemini");
    expect(cfg.apiKey).toBe("g-auto");
  });

  it("stays unconfigured (never fabricates) when the key is blank", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "gemini");
    expect(agentConfig().apiKey).toBeNull();
    expect(createProvider(agentConfig())).toBeNull();
  });

  it("an explicit openai provider is not overridden by a GEMINI_API_KEY", () => {
    vi.stubEnv("GEMINI_API_KEY", "g-x");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "openai");
    const cfg = agentConfig();
    expect(cfg.provider).toBe("openai");
  });

  it("explicit model/base overrides win over Gemini defaults", () => {
    vi.stubEnv("GEMINI_API_KEY", "g-y");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "gemini");
    vi.stubEnv("RECODE_AGENT_MODEL", "gemini-2.0-flash");
    vi.stubEnv("RECODE_AGENT_BASE_URL", "https://proxy.test/v1");
    const cfg = agentConfig();
    expect(cfg.model).toBe("gemini-2.0-flash");
    expect(cfg.baseUrl).toBe("https://proxy.test/v1");
  });
});

describe("OpenAICompatibleProvider — streaming parse + tool-call reassembly", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(frames: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  it("streams text deltas and reassembles fragmented tool-call arguments", async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Checking "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"the tape…"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"getMarketData","arguments":"{\\"symbol\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"SPY\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(frames)),
    );

    const provider = new OpenAICompatibleProvider(
      "https://provider.test/v1",
      "sk-test",
      "test-model",
      5_000,
    );
    const events: { type: string; text?: string; call?: { id: string; name: string; arguments: string }; finishReason?: string | null }[] = [];
    for await (const ev of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [sampleTool] })) {
      events.push(ev);
    }

    const texts = events.filter((e) => e.type === "text").map((e) => e.text ?? "");
    expect(texts.join("")).toBe("Checking the tape…");

    const calls = events.filter((e) => e.type === "tool_call");
    expect(calls.length).toBe(1);
    expect(calls[0].call?.id).toBe("call_1");
    expect(calls[0].call?.name).toBe("getMarketData");
    expect(calls[0].call?.arguments).toBe('{"symbol":"SPY"}');

    const end = events.find((e) => e.type === "end");
    expect(end?.finishReason).toBe("tool_calls");
  });

  it("surfaces provider errors as failures instead of fabricating output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })),
    );
    const provider = new OpenAICompatibleProvider(
      "https://provider.test/v1",
      "sk-bad",
      "test-model",
      5_000,
    );
    await expect(async () => {
      for await (const _ of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [] })) {
        void _;
      }
    }).rejects.toThrow(/Provider error 401/);
  });
});

/* ── Gemini thought signatures + thought summaries (verified wire format) ── */

type StreamEvent = {
  type: string;
  text?: string;
  call?: { id: string; name: string; arguments: string; thoughtSignature?: string };
  finishReason?: string | null;
};

const TOOL_CALL_CHUNK =
  "data: " +
  JSON.stringify({
    choices: [
      {
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "call_9",
              type: "function",
              function: { name: "calculator", arguments: '{"a":271,"b":913}' },
              extra_content: { google: { thought_signature: "SIG_TEST" } },
            },
          ],
        },
      },
    ],
  }) +
  "\n\n";

describe("OpenAICompatibleProvider — Gemini thought signatures & summaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(frames: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(encoder.encode(f));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  it("keeps parallel tool calls that reuse the same index separate (Gemini compat)", async () => {
    // Gemini's OpenAI-compat layer can emit several COMPLETE calls that all
    // use index 0 — each with its own id, arguments and thought signature.
    const mk = (id: string, sig: string) =>
      "data: " +
      JSON.stringify({
        choices: [
          {
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: "function",
                  function: { name: "getWhaleActivity", arguments: `{"call":"${id}"}` },
                  extra_content: { google: { thought_signature: sig } },
                },
              ],
            },
          },
        ],
      }) +
      "\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          mk("call_a", "SIG_A"),
          mk("call_b", "SIG_B"),
          mk("call_c", "SIG_C"),
          'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":"tool_calls"}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const provider = new OpenAICompatibleProvider("https://provider.test/v1", "sk", "m", 5_000);
    const events: StreamEvent[] = [];
    for await (const ev of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [sampleTool] })) {
      events.push(ev as StreamEvent);
    }
    const calls = events.filter((e) => e.type === "tool_call").map((e) => e.call);
    expect(calls.length).toBe(3);
    expect(calls.map((c) => c?.id)).toEqual(["call_a", "call_b", "call_c"]);
    expect(calls.map((c) => c?.arguments)).toEqual([
      '{"call":"call_a"}',
      '{"call":"call_b"}',
      '{"call":"call_c"}',
    ]);
    expect(calls.map((c) => c?.thoughtSignature)).toEqual(["SIG_A", "SIG_B", "SIG_C"]);
  });

  it("captures extra_content.google.thought_signature on tool calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{}}]}\n\n', // empty delta chunk — never dropped
          TOOL_CALL_CHUNK,
          'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":"tool_calls"}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const provider = new OpenAICompatibleProvider("https://provider.test/v1", "sk", "m", 5_000);
    const events: StreamEvent[] = [];
    for await (const ev of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [sampleTool] })) {
      events.push(ev as StreamEvent);
    }
    const call = events.find((e) => e.type === "tool_call")?.call;
    expect(call?.name).toBe("calculator");
    expect(call?.arguments).toBe('{"a":271,"b":913}');
    expect(call?.thoughtSignature).toBe("SIG_TEST");
  });

  it("splits inline <thought> summaries from answer text across chunk boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"<thought>Evaluating","extra_content":{"google":{"thought":true}}}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" the clues"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"</thou"}}]}\n\n', // tag split across chunks
          'data: {"choices":[{"delta":{"content":"ght>Here is the answer."}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const provider = new OpenAICompatibleProvider("https://provider.test/v1", "sk", "m", 5_000);
    const events: StreamEvent[] = [];
    for await (const ev of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [] })) {
      events.push(ev as StreamEvent);
    }
    const thought = events.filter((e) => e.type === "thought").map((e) => e.text ?? "").join("");
    const answer = events.filter((e) => e.type === "text").map((e) => e.text ?? "").join("");
    expect(thought).toBe("Evaluating the clues");
    expect(answer).toBe("Here is the answer.");
  });

  it("treats marker-only thought chunks (extra_content.google.thought) as thoughts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"reasoning hard","extra_content":{"google":{"thought":true}}}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"visible answer"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const provider = new OpenAICompatibleProvider("https://provider.test/v1", "sk", "m", 5_000);
    const events: StreamEvent[] = [];
    for await (const ev of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [] })) {
      events.push(ev as StreamEvent);
    }
    const thought = events.filter((e) => e.type === "thought").map((e) => e.text ?? "").join("");
    const answer = events.filter((e) => e.type === "text").map((e) => e.text ?? "").join("");
    expect(thought).toBe("reasoning hard");
    expect(answer).toBe("visible answer");
  });

  it("replays the thought signature with the assistant tool-call turn and strips thoughts from content", async () => {
    interface ReplayCapture {
      messages: {
        role: string;
        content: string | null;
        tool_calls?: { extra_content?: { google?: { thought_signature?: string } } }[];
      }[];
    }
    /* Holder object — assignments happen inside the fetch stub callback. */
    const state: { captured: ReplayCapture | null } = { captured: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        state.captured = JSON.parse(String(init?.body ?? "{}")) as ReplayCapture;
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      }),
    );
    const provider = new OpenAICompatibleProvider("https://provider.test/v1", "sk", "m", 5_000);
    for await (const _ of provider.chat({
      messages: [
        {
          role: "assistant",
          content: "<thought>internal reasoning</thought>Visible summary",
          toolCalls: [
            { id: "c1", name: "getMarketData", arguments: "{}", thoughtSignature: "SIG_ORIG" },
          ],
        },
      ],
      tools: [],
    })) {
      void _;
    }
    const assistant = state.captured?.messages[0];
    expect(assistant?.content).toBe("Visible summary");
    // The signature survives the round trip — verbatim, never regenerated.
    expect(assistant?.tool_calls?.[0]?.extra_content?.google?.thought_signature).toBe("SIG_ORIG");
  });
});

describe("OpenAICompatibleProvider — thinking configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  it("sends extra_body.google.thinking_config on the Gemini OpenAI-compat endpoint", async () => {
    interface ThinkingCapture {
      reasoning_effort?: string;
      extra_body?: { google?: { thinking_config?: Record<string, unknown> } };
    }
    const state: { captured: ThinkingCapture | null } = { captured: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        state.captured = JSON.parse(String(init?.body ?? "{}")) as ThinkingCapture;
        return sseResponse();
      }),
    );
    const provider = new OpenAICompatibleProvider(
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "sk",
      "gemini-3.6-flash",
      5_000,
    );
    for await (const _ of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      thinkingLevel: "low",
    })) {
      void _;
    }
    expect(state.captured?.extra_body?.google?.thinking_config).toEqual({
      include_thoughts: true,
      thinking_level: "low",
    });
    // reasoning_effort and thinking_level overlap — never sent together.
    expect(state.captured?.reasoning_effort).toBeUndefined();
  });

  it("maps explicit levels to reasoning_effort on vanilla OpenAI and stays silent on auto", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return sseResponse();
      }),
    );
    const provider = new OpenAICompatibleProvider("https://api.openai.com/v1", "sk", "gpt-4o-mini", 5_000);
    for await (const _ of provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      thinkingLevel: "low",
    })) {
      void _;
    }
    expect(body.reasoning_effort).toBe("low");
    expect(body.extra_body).toBeUndefined();
    body = {};
    for await (const _ of provider.chat({ messages: [{ role: "user", content: "hi" }], tools: [] })) {
      void _;
    }
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.extra_body).toBeUndefined();
  });
});

describe("agentConfig — thinking level", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to auto (no thinking parameter sent)", () => {
    expect(agentConfig().thinkingLevel).toBe("auto");
  });

  it("accepts an explicit valid level", () => {
    vi.stubEnv("RECODE_AGENT_THINKING_LEVEL", "low");
    expect(agentConfig().thinkingLevel).toBe("low");
  });

  it("falls back to auto on invalid values", () => {
    vi.stubEnv("RECODE_AGENT_THINKING_LEVEL", "maximum");
    expect(agentConfig().thinkingLevel).toBe("auto");
  });
});

describe("runAgentTurn — user-safe error normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("normalizes provider failures into the single safe user message", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k-test");
    vi.stubEnv("RECODE_AGENT_PROVIDER", "gemini");
    // Simulates the exact production failure mode: HTTP 400 with the raw
    // thought_signature complaint in the provider body.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          '{"error":{"code":400,"message":"Function call is missing a thought_signature in functionCall parts."}}',
          { status: 400 },
        ),
      ),
    );
    const events: { type: string; message?: string; code?: string }[] = [];
    for await (const ev of runAgentTurn({ history: [], message: "hi", context: null })) {
      events.push(ev as { type: string; message?: string; code?: string });
    }
    const err = events.find((e) => e.type === "error");
    expect(err?.message).toBe(USER_SAFE_ERROR);
    expect(err?.message).toBe("Server is busy. Please try again shortly.");
    expect(err?.code).toBe("AGENT_BUSY");
    // Raw internals must never leak into the user-facing message.
    expect(err?.message?.toLowerCase()).not.toContain("thought_signature");
    expect(err?.message).not.toContain("400");
  });
});

