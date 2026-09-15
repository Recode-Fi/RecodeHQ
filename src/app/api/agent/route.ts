import { runAgentTurn, type ClientChatMessage } from "@/server/agent/agent";
import type { AgentPageContext } from "@/server/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * RECODE Agent streaming endpoint (SSE).
 * POST { history, message, context } → stream of AgentEvent frames
 * (status / tool_start / tool_done / token / done / error).
 * Client disconnects abort the provider stream immediately.
 */

function sseFrame(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  let body: {
    history?: ClientChatMessage[];
    message?: string;
    context?: AgentPageContext | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message : "";
  const history = Array.isArray(body.history)
    ? body.history.filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" && m.content.length > 0,
      )
    : [];
  const context =
    body.context && typeof body.context === "object" && typeof body.context.page === "string"
      ? body.context
      : null;

  if (!message.trim()) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      try {
        for await (const ev of runAgentTurn({
          history,
          message,
          context,
          signal: request.signal,
        })) {
          if (closed) break;
          send(ev);
        }
      } catch (e) {
        /* Full technical detail stays in server logs — the client only
           ever receives the normalized user-safe message. */
        console.error("[recode-agent] unhandled turn failure:", e);
        send({
          type: "error",
          code: "AGENT_BUSY",
          message: "Server is busy. Please try again shortly.",
        });
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
