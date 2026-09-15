/**
 * Wire-format bisect: replays the exact captured round-2 request
 * (.recode-debug-last-request.json) against Gemini with controlled
 * variations to isolate the 400 INVALID_ARGUMENT cause.
 * API key loaded from .env.local, never printed. Signatures are model
 * metadata (not secrets); error bodies are redacted.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const key = env.GEMINI_API_KEY || env.RECODE_AGENT_API_KEY;
if (!key) { console.error("NO_KEY_FOUND"); process.exit(1); }
const base = "https://generativelanguage.googleapis.com/v1beta/openai";
const orig = JSON.parse(readFileSync(".recode-debug-last-request.json", "utf8"));

const redact = (s) => s.replace(/[A-Za-z0-9+/=_-]{40,}/g, (v) => v.slice(0, 12) + "…");

async function tryReq(label, body) {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await res.text().catch(() => "");
      console.log(`${label}: HTTP ${res.status} OK`);
    } else {
      console.log(`${label}: HTTP ${res.status} ${redact((await res.text()).slice(0, 180))}`);
    }
  } catch (e) {
    console.log(`${label}: NETWORK ${e instanceof Error ? e.message : String(e)}`);
  }
}

const clone = () => JSON.parse(JSON.stringify(orig));
const isSystem = (m) => m.role === "system";
const isAssistant = (m) => m.role === "assistant";
const isTool = (m) => m.role === "tool";

await tryReq("W0 exact replay                 ", clone());

{ const b = clone(); b.messages = b.messages.filter((m) => !isSystem(m)); await tryReq("W1 no system message            ", b); }
{
  /* Keep only the call that carries the signature + its tool result. */
  const b = clone();
  const a = b.messages.find(isAssistant);
  const withSig = a.tool_calls.filter((tc) => tc.extra_content?.google?.thought_signature);
  const keepIds = new Set(withSig.map((tc) => tc.id));
  a.tool_calls = withSig;
  b.messages = b.messages.filter((m) => !isTool(m) || keepIds.has(m.tool_call_id));
  await tryReq("W2 only signature-bearing call  ", b);
}
{
  const b = clone();
  const a = b.messages.find(isAssistant);
  for (const tc of a.tool_calls) delete tc.extra_content;
  await tryReq("W3 no signatures at all (control)", b);
}
{
  /* DIAGNOSTIC ONLY (never ship): copy the first signature onto every call. */
  const b = clone();
  const a = b.messages.find(isAssistant);
  const sig = a.tool_calls[0]?.extra_content?.google?.thought_signature;
  for (const tc of a.tool_calls) tc.extra_content = { google: { thought_signature: sig } };
  await tryReq("W4 DIAGNOSTIC sig on every call ", b);
}
{
  const b = clone();
  const a = b.messages.find(isAssistant);
  a.content = "";
  await tryReq("W5 assistant content ''         ", b);
}
