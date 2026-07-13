import { BandClient } from "@band-ai/rest-client";
import { AuditActor, PipelineResult } from "./types";

// Real governance transport through Band (docs.band.ai, guide at
// band.ai/hacker-guide). Verified against the published @band-ai/rest-client
// package — request/response shapes below are taken directly from its
// reference.md, not guessed.
//
// Model: each of our 5 conceptual agents (Prospector/Researcher/Writer/
// Compliance/Manager) is a distinct *External Agent* registered by hand in
// the Band dashboard (app.band.ai/agents — this is a manual, one-time-shown
// API key step that can't be scripted headlessly). Each gets its own
// (agent_id, api_key) pair, set as env vars below. We use Band's low-level
// REST endpoints (not the long-running `agent.run()` WebSocket loop, which
// assumes a persistent process) so this fits a stateless Next.js API route:
//   - createAgentChat            -> one room per pipeline run
//   - addAgentChatParticipant    -> other 4 agents join the room
//   - createAgentChatMessage     -> @mention delegation/handoff (Prospector->
//                                   Researcher->Writer)
//   - createAgentChatEvent       -> draft / veto / revise / auto-approve as
//                                   tool_result | error | task events; the
//                                   Manager's escalation is a real Band
//                                   `attention` event (kind: "review",
//                                   blocking: true) — Band's own
//                                   human-in-the-loop primitive. The human's
//                                   decision (from our app's approval card)
//                                   is posted back as a resolution event
//                                   referencing it via `metadata.resolves`.
//
// Everything here is best-effort and non-blocking: if the 5 agent pairs
// aren't configured, every export is a no-op and the deterministic pipeline
// in lib/pipeline.ts (the demo's real source of truth) is unaffected.

export const AGENT_KEYS = ["prospector", "researcher", "writer", "compliance", "manager"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const AGENT_DISPLAY_NAMES: Record<AgentKey, string> = {
  prospector: "Prospector",
  researcher: "Researcher",
  writer: "Writer",
  compliance: "Compliance Guardian",
  manager: "Manager",
};

function envKey(key: AgentKey, suffix: "AGENT_ID" | "API_KEY") {
  return `BAND_${key.toUpperCase()}_${suffix}`;
}

function getCreds(key: AgentKey): { agentId: string; apiKey: string } | null {
  const agentId = process.env[envKey(key, "AGENT_ID")];
  const apiKey = process.env[envKey(key, "API_KEY")];
  if (!agentId || !apiKey) return null;
  return { agentId, apiKey };
}

export function bandFullyConfigured(): boolean {
  return AGENT_KEYS.every((key) => getCreds(key) !== null);
}

const clients = new Map<AgentKey, BandClient>();

function getClient(key: AgentKey): BandClient | null {
  const creds = getCreds(key);
  if (!creds) return null;
  if (!clients.has(key)) {
    clients.set(key, new BandClient({ apiKey: creds.apiKey }));
  }
  return clients.get(key)!;
}

async function warnable<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[band] ${label} failed (non-fatal):`, error);
    return null;
  }
}

async function ensureRoom(title: string): Promise<string | null> {
  const owner = getClient("manager");
  if (!owner) return null;

  const created = await warnable("createAgentChat", () =>
    owner.agentApiChats.createAgentChat({ chat: { title: title.slice(0, 120) } })
  );
  const roomId = created?.data?.id;
  if (!roomId) return null;

  for (const key of AGENT_KEYS) {
    if (key === "manager") continue;
    const creds = getCreds(key);
    if (!creds) continue;
    await warnable(`addParticipant(${key})`, () =>
      owner.agentApiParticipants.addAgentChatParticipant(roomId, {
        participant: { participant_id: creds.agentId, role: "member" },
      })
    );
  }

  return roomId;
}

async function postDelegate(roomId: string, from: AgentKey, to: AgentKey, content: string) {
  const sender = getClient(from);
  const toCreds = getCreds(to);
  if (!sender || !toCreds) return;
  await warnable(`message(${from}->${to})`, () =>
    sender.agentApiMessages.createAgentChatMessage(roomId, {
      message: {
        content: `@${AGENT_DISPLAY_NAMES[to]} ${content}`,
        mentions: [{ id: toCreds.agentId, name: AGENT_DISPLAY_NAMES[to] }],
      },
    })
  );
}

async function postEvent(
  roomId: string,
  actor: AgentKey,
  messageType: "tool_result" | "thought" | "error" | "task",
  content: string,
  metadata?: Record<string, unknown>
) {
  const client = getClient(actor);
  if (!client) return null;
  const res = await warnable(`event(${actor}:${messageType})`, () =>
    client.agentApiEvents.createAgentChatEvent(roomId, {
      event: { content, message_type: messageType, metadata },
    })
  );
  return res?.data?.id ?? null;
}

async function postAttention(roomId: string, actor: AgentKey, content: string, blocking: boolean) {
  const client = getClient(actor);
  if (!client) return null;
  const res = await warnable(`event(${actor}:attention)`, () =>
    client.agentApiEvents.createAgentChatEvent(roomId, {
      event: {
        content,
        message_type: "attention",
        metadata: { kind: "review", blocking },
      },
    })
  );
  return res?.data?.id ?? null;
}

async function postResolution(roomId: string, actor: AgentKey, resolvesEventId: string, content: string) {
  const client = getClient(actor);
  if (!client) return;
  await warnable(`event(${actor}:resolution)`, () =>
    client.agentApiEvents.createAgentChatEvent(roomId, {
      event: {
        content,
        message_type: "task",
        metadata: { resolves: resolvesEventId },
      },
    })
  );
}

// AuditAction -> how it's represented on the Band transport.
const ACTION_EVENT_TYPE: Partial<Record<string, "tool_result" | "thought" | "error" | "task">> = {
  draft: "thought",
  verify: "tool_result",
  revise: "task",
  veto: "error",
  auto_approve: "task",
};

const ACTOR_TO_KEY: Partial<Record<AuditActor, AgentKey>> = {
  prospector: "prospector",
  researcher: "researcher",
  writer: "writer",
  compliance: "compliance",
  manager: "manager",
};

// Per-run Band state (room + open escalation), so a later human decision
// (POST /api/runs/[id]/approve, a separate request) can resolve the same
// `attention` event this function raised.
const runBandState = new Map<string, { roomId: string; escalationEventId: string | null }>();

// Replays a completed pipeline run onto Band: one room, @mention delegation
// for the handoff steps, and events (or a blocking `attention` for the
// escalation) for everything else. Call via Next's `after()` so it doesn't
// add Band's network latency to the user-facing response — see
// app/api/runs/route.ts.
export async function mirrorRunToBand(result: PipelineResult): Promise<void> {
  if (!bandFullyConfigured()) return;

  const roomId = await ensureRoom(`Scout — ${result.account.name}`);
  if (!roomId) return;

  await postDelegate(roomId, "prospector", "researcher", `${result.account.name} is worth researching this week.`);
  await postDelegate(
    roomId,
    "researcher",
    "writer",
    `Signal attached — "${result.signal.summary}" (cited ${result.signal.sourceUrl}). Draft outreach.`
  );

  let escalationEventId: string | null = null;

  for (const entry of result.auditLog) {
    const actorKey = ACTOR_TO_KEY[entry.actor];
    if (!actorKey) continue;

    if (entry.action === "escalate") {
      escalationEventId = await postAttention(roomId, actorKey, entry.detail, true);
      continue;
    }

    const messageType = ACTION_EVENT_TYPE[entry.action];
    if (messageType) {
      await postEvent(roomId, actorKey, messageType, entry.detail, {
        authority_rule: entry.authorityRule,
        target_id: entry.targetId,
      });
    }
  }

  runBandState.set(result.runId, { roomId, escalationEventId });
}

// Called from POST /api/runs/[id]/approve once the human decides. Human
// decisions have no Band agent identity of their own (the Human API is
// Enterprise-only — see comment at top of file), so the Manager posts the
// resolution on the human's behalf, referencing the original attention event.
export async function mirrorApprovalToBand(runId: string, detail: string): Promise<void> {
  if (!bandFullyConfigured()) return;
  const state = runBandState.get(runId);
  if (!state?.escalationEventId) return;
  await postResolution(state.roomId, "manager", state.escalationEventId, detail);
}
