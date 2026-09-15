import { agentConfig, isAgentConfigured } from "@/server/agent/config";

export const dynamic = "force-dynamic";

/**
 * Agent configuration status for the UI. Never exposes the key —
 * only whether the agent backend is wired up and which model is
 * targeted (so the panel can show an honest state).
 */
export async function GET() {
  const cfg = agentConfig();
  return Response.json({
    configured: isAgentConfigured(),
    provider: cfg.provider,
    model: cfg.apiKey ? cfg.model : null,
  });
}
