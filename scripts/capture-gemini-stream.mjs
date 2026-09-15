/**
 * Replay verification: does the thought_signature round-trip fix the 400?
 * Round 1: capture a tool call + its signature (kept in memory, never printed).
 * Round 2a: replay WITHOUT signature  -> expect 400 (production bug).
 * Round 2b: replay WITH signature at tool_calls[].extra_content.google
 *           -> expect 200 (fix verified).
 * Never prints the API key; error bodies are redacted.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const key = env.GEMINI_API_KEY || env.RECODE_AGENT_API_KEY;
if (!key) { console.error("NO_KEY_FOUND"); process.exit(1); }
const model = env.RECODE_AGENT_MODEL || "gemini-2.5-flash";
const base = "https://generativelanguage.googleapis.com/v1beta/openai";

const tools = [
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Multiply two integers and return the product.",
      parameters: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      },
    },
  },
];

async function streamRound(messages) {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      tools,
      extra_body: { google: { thinking_config: { thinking_level: "low", include_thoughts: true } } },
    }),
  });
  if (!res.ok) return { status: res.status, body: await res.text() };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", call = null, finish = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk;
      try { chunk = JSON.parse(payload); } catch { continue; }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.delta?.content) text += choice.delta.content;
      for (const tc of choice.delta?.tool_calls ?? []) {
        if (!call) call = { id: "", name: "", arguments: "", signature: null };
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name = tc.function.name;
        if (tc.function?.arguments) call.arguments += tc.function.arguments;
        const sig = tc.extra_content?.google?.thought_signature;
        if (typeof sig === "string" && sig) call.signature = sig;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }
  return { status: 200, text, call, finish };
}

const round1 = await streamRound([
  { role: "user", content: "What is 271 * 913? Use the calculator tool." },
]);
console.log("ROUND1 status:", round1.status, "finish:", round1.finish);
if (round1.status !== 200) {
  console.log("body:", round1.body.slice(0, 200));
  process.exit(1);
}
const c = round1.call;
console.log("ROUND1 tool call:", c ? { id: c.id, name: c.name, args: c.arguments, hasSignature: Boolean(c.signature), sigLen: c.signature?.length ?? 0 } : null);

if (!c?.signature) {
  console.log("NO SIGNATURE ARRIVED — cannot verify replay.");
  process.exit(1);
}

const args = JSON.parse(c.arguments);
const toolResult = { product: args.a * args.b };
const toolMsg = { role: "tool", tool_call_id: c.id, content: JSON.stringify(toolResult) };

/* 2a — WITHOUT signature (reproduces production 400) */
const noSig = await streamRound([
  { role: "user", content: "What is 271 * 913? Use the calculator tool." },
  { role: "assistant", content: round1.text || null, tool_calls: [{ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } }] },
  toolMsg,
]);
console.log("ROUND2a (no signature) status:", noSig.status);
if (noSig.status !== 200) {
  console.log("error body:", noSig.body.replace(/[A-Za-z0-9+/=_-]{40,}/g, (v) => v.slice(0, 16) + "…").slice(0, 400));
}

/* 2b — WITH signature at extra_content.google.thought_signature */
const withSig = await streamRound([
  { role: "user", content: "What is 271 * 913? Use the calculator tool." },
  {
    role: "assistant",
    content: round1.text || null,
    tool_calls: [{
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: c.arguments },
      extra_content: { google: { thought_signature: c.signature } },
    }],
  },
  toolMsg,
]);
console.log("ROUND2b (signature at extra_content.google) status:", withSig.status);
if (withSig.status === 200) {
  console.log("ROUND2b final text (first 300 chars):", JSON.stringify(withSig.text.slice(0, 300)));
} else {
  console.log("error body:", withSig.body.replace(/[A-Za-z0-9+/=_-]{40,}/g, (v) => v.slice(0, 16) + "…").slice(0, 400));
}
