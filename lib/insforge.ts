import { createAdminClient } from "@insforge/sdk";
import { integrationStatus } from "./env";
import { Account, AuditLogEntry, Draft, Signal } from "./types";

// Persistence layer for InsForge Postgres (accounts/signals/drafts/audit_log
// — schema in migrations/001_init.sql). The pipeline's source of truth stays
// the in-memory store in lib/store.ts so the live demo never stalls on
// network latency; every write here is a best-effort, fire-and-forget
// mirror so InsForge holds the durable copy + audit trail once configured.
// Falls back to a no-op when INSFORGE_BASE_URL/INSFORGE_API_KEY are unset.

let client: ReturnType<typeof createAdminClient> | null = null;

function getClient() {
  if (!integrationStatus.insforge) return null;
  if (!client) {
    client = createAdminClient({
      baseUrl: process.env.INSFORGE_BASE_URL!,
      apiKey: process.env.INSFORGE_API_KEY!,
    });
  }
  return client;
}

function warn(table: string, error: unknown) {
  console.warn(`[insforge] mirror write to "${table}" failed (non-fatal):`, error);
}

export function mirrorAccount(account: Account) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("accounts")
    .insert([
      {
        id: account.id,
        name: account.name,
        vertical: account.vertical,
        city: account.city,
        region: account.region,
        website: account.website,
        contact_path: account.contactPath,
        value_tier: account.valueTier,
        est_value_usd: account.estValueUsd,
      },
    ])
    .then(
      ({ error }) => error && warn("accounts", error),
      (error) => warn("accounts", error)
    );
}

export function mirrorSignal(signal: Signal) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("signals")
    .insert([
      {
        id: signal.id,
        account_id: signal.accountId,
        type: signal.type,
        summary: signal.summary,
        strength: signal.strength,
        source_url: signal.sourceUrl,
        source_quote: signal.sourceQuote,
        detected_at: signal.detectedAt,
      },
    ])
    .then(
      ({ error }) => error && warn("signals", error),
      (error) => warn("signals", error)
    );
}

export function mirrorDraft(draft: Draft) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("drafts")
    .insert([
      {
        id: draft.id,
        account_id: draft.accountId,
        signal_id: draft.signalId,
        channel: draft.channel,
        body: draft.body,
        status: draft.status,
        revision_of: draft.revisionOf ?? null,
      },
    ])
    .then(
      ({ error }) => error && warn("drafts", error),
      (error) => warn("drafts", error)
    );
}

export function mirrorDraftStatus(draftId: string, status: Draft["status"]) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("drafts")
    .update({ status })
    .eq("id", draftId)
    .then(
      ({ error }) => error && warn("drafts(update)", error),
      (error) => warn("drafts(update)", error)
    );
}

export function mirrorAuditLog(entry: AuditLogEntry) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("audit_log")
    .insert([
      {
        id: entry.id,
        actor: entry.actor,
        action: entry.action,
        target_id: entry.targetId ?? null,
        authority_rule: entry.authorityRule ?? null,
        channel: entry.channel ?? null,
        detail: entry.detail,
      },
    ])
    .then(
      ({ error }) => error && warn("audit_log", error),
      (error) => warn("audit_log", error)
    );
}

export function mirrorApproval(params: {
  draftId: string;
  decidedBy: "manager_auto" | "human";
  decision: "approve" | "edit" | "reject";
  channel: "band" | "imessage";
  note?: string;
}) {
  const db = getClient();
  if (!db) return;
  db.database
    .from("approvals")
    .insert([
      {
        draft_id: params.draftId,
        decided_by: params.decidedBy,
        decision: params.decision,
        channel: params.channel,
        note: params.note ?? null,
      },
    ])
    .then(
      ({ error }) => error && warn("approvals", error),
      (error) => warn("approvals", error)
    );
}
