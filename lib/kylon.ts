import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PipelineResult } from "./types";

// Kylon integration (PRD: "the workspace the floor reports into" / the
// AI-employee presentation layer). Verified live against the real `kylon`
// CLI (kylon-cli@latest on npm) and the actual app.kylon.io workspace on
// 2026-07-13 — not built from the hosted docs alone, which describe a
// `table apply` primitive that the live backend has since retired
// ("410: Table creation has been retired. Create a database app for new
// structured data."). So this mirrors the floor into channel messages and
// per-account threads, not tables.
//
// Auth: the CLI's own `kylon auth login` stores a browser-authenticated
// session at ~/.kylon/workspace-auth.json, which every `kylon workspace ...`
// call picks up with zero extra flags. That's what's used here for the
// local/demo path. For a headless deploy, the CLI also accepts
// KYLON_WORKSPACE_API_URL / KYLON_WORKSPACE_ID / KYLON_WORKSPACE_API_KEY
// (a pak_ key) as env vars instead — see integrationStatus.kylon below.
// Everything here is best-effort and non-blocking, matching lib/band.ts:
// if Kylon isn't configured, every export is a no-op and the deterministic
// pipeline in lib/pipeline.ts is unaffected.

const execFileAsync = promisify(execFile);

const KYLON_SESSION_PATH = join(homedir(), ".kylon", "workspace-auth.json");

export function kylonConfigured(): boolean {
  return Boolean(process.env.KYLON_WORKSPACE_API_KEY) || existsSync(KYLON_SESSION_PATH);
}

const CLI_TIMEOUT_MS = 15_000;

async function kylon(args: string[]): Promise<string | null> {
  if (!kylonConfigured()) return null;
  try {
    const { stdout } = await execFileAsync("kylon", args, { timeout: CLI_TIMEOUT_MS });
    return stdout.trim();
  } catch (error) {
    console.warn(`[kylon] command failed (non-fatal): kylon ${args.join(" ")}`, error);
    return null;
  }
}

// The channel to report into. Resolved once per process and cached — avoids
// hardcoding a workspace-specific channel id in source. Defaults to the
// workspace's #general (present in every workspace) unless overridden.
const CHANNEL_NAME = process.env.KYLON_CHANNEL_NAME || "general";
let cachedChannelId: string | null | undefined;

async function resolveChannelId(): Promise<string | null> {
  if (cachedChannelId !== undefined) return cachedChannelId;
  const output = await kylon(["workspace", "channel", "list"]);
  // Output format confirmed live: "- 02de99d21377  #general  iconColor=green"
  const line = output?.split("\n").find((l) => l.includes(`#${CHANNEL_NAME}`));
  const match = line?.match(/^-?\s*([a-f0-9]{8,})/);
  cachedChannelId = match?.[1] ?? null;
  return cachedChannelId;
}

async function postMessage(text: string): Promise<string | null> {
  const channelId = await resolveChannelId();
  if (!channelId) return null;
  const output = await kylon(["workspace", "message", "send", "--channel", channelId, "--text", text]);
  // Confirmed live: "Sent message (id: 4548c235ac95)"
  return output?.match(/id: ([a-f0-9]+)/)?.[1] ?? null;
}

async function createThread(text: string): Promise<string | null> {
  const channelId = await resolveChannelId();
  if (!channelId) return null;
  const output = await kylon([
    "workspace",
    "thread",
    "create",
    "--scope-channel",
    channelId,
    "--text",
    text,
  ]);
  // Confirmed live: "Created new thread root (id: 8fe7df25a4ec)"
  return output?.match(/id: ([a-f0-9]+)/)?.[1] ?? null;
}

async function replyThread(rootId: string, text: string): Promise<void> {
  const channelId = await resolveChannelId();
  if (!channelId) return;
  await kylon([
    "workspace",
    "thread",
    "msg",
    "--root",
    rootId,
    "--text",
    text,
    "--scope-channel",
    channelId,
  ]);
}

// Per-run Kylon thread, so a later human decision (a separate request) can
// reply in the same thread the floor opened for that account.
const runThreads = new Map<string, string>();

// Mirrors a completed pipeline run into Kylon: one thread per account,
// opened with the Prospector/Researcher/Writer narrative, closing on either
// an auto-approve or an escalation callout — the "AI employee" framing the
// PRD asks for, watchable next to (not instead of) Band's own governance
// room. Call via Next's `after()`, same as mirrorRunToBand, so Kylon's CLI
// round-trip doesn't add latency to the user-facing response.
export async function mirrorRunToKylon(result: PipelineResult): Promise<void> {
  if (!kylonConfigured()) return;

  const { account, signal, finalDraft } = result;

  const rootId = await createThread(
    `**${account.name}** (${account.city}, ${account.region} · est. $${account.estValueUsd.toLocaleString()}, ${account.valueTier.replace("_", " ")})\n\n` +
      `Prospector → Researcher: "${signal.summary}"\nSource: ${signal.sourceUrl}`
  );
  if (!rootId) return;
  runThreads.set(result.runId, rootId);

  await replyThread(rootId, `Writer drafted outreach off this signal:\n\n${finalDraft.body}`);

  if (result.requiresHuman) {
    await replyThread(
      rootId,
      `Manager escalated this account for approval — Manager cannot approve high-value accounts on its own authority. Routed to the human via Band; awaiting a decision.`
    );
  } else {
    await replyThread(
      rootId,
      `Manager auto-approved — routine tier, within its authority. No human review required.`
    );
  }
}

// Called once the human decides on an escalated draft (POST
// /api/runs/[id]/approve), so the Kylon thread shows the same resolution
// Band recorded, not just the open escalation.
export async function mirrorApprovalToKylon(runId: string, detail: string): Promise<void> {
  if (!kylonConfigured()) return;
  const rootId = runThreads.get(runId);
  if (!rootId) return;
  await replyThread(rootId, detail);
}

// Posted once per floor run (PRD Beat 1: "give the floor a goal"), before any
// account-level threads exist yet.
export async function announceFloorGoal(goal: string, sourceLabel: string, live: boolean): Promise<void> {
  if (!kylonConfigured()) return;
  await postMessage(
    `New goal: "${goal}"\n\nProspector is building the account list${live ? ` from ${sourceLabel} (live)` : ` — falling back to ${sourceLabel}`}...`
  );
}
