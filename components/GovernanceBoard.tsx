"use client";

import { useEffect, useMemo, useState } from "react";
import { AuditLogEntry, Draft, FloorRun, PipelineResult } from "@/lib/types";
import { ACTOR_META, actionBadge } from "@/lib/actor-meta";

type IntegrationStatus = Record<"insforge" | "nimble" | "youdotcom" | "band" | "hydra" | "kylon", boolean>;

const REVEAL_INTERVAL_MS = 450;

const EXAMPLE_GOAL = "Find used-car dealerships in the Bay Area worth reaching out to this week";

const INTEGRATION_LABELS: { key: keyof IntegrationStatus; label: string }[] = [
  { key: "band", label: "Band" },
  { key: "insforge", label: "InsForge" },
  { key: "nimble", label: "Nimble" },
  { key: "youdotcom", label: "You.com" },
  { key: "hydra", label: "Hydra" },
  { key: "kylon", label: "Kylon" },
];

export default function GovernanceBoard() {
  const [goal, setGoal] = useState(EXAMPLE_GOAL);
  const [floor, setFloor] = useState<FloorRun | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setIntegrations(data.integrations))
      .catch(() => setIntegrations(null));
  }, []);

  // Reveal the floor's work one step at a time so the human can actually watch
  // the delegation, the veto, and the escalation happen.
  useEffect(() => {
    if (!floor) return;
    if (visibleCount >= floor.auditLog.length) return;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [floor, visibleCount]);

  const visibleLog = useMemo(
    () => (floor ? floor.auditLog.slice(0, visibleCount) : []),
    [floor, visibleCount]
  );

  // An account's card appears the moment the Prospector hands it off.
  const revealedAccountIds = useMemo(
    () => new Set(visibleLog.map((e) => e.accountId).filter(Boolean) as string[]),
    [visibleLog]
  );

  const revealDone = !!floor && visibleCount >= floor.auditLog.length;

  const revealedRuns = useMemo(
    () => (floor ? floor.runs.filter((r) => revealedAccountIds.has(r.account.id)) : []),
    [floor, revealedAccountIds]
  );

  const awaitingApproval = revealDone
    ? revealedRuns.filter((r) => r.requiresHuman && r.finalDraft.status === "escalated")
    : [];

  async function runTheFloor() {
    setRunning(true);
    setFloor(null);
    setVisibleCount(0);
    setNotes({});
    try {
      const res = await fetch("/api/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data: FloorRun = await res.json();
      setFloor(data);
    } finally {
      setRunning(false);
    }
  }

  async function decide(run: PipelineResult, decision: "approve" | "reject") {
    setDeciding(run.runId);
    try {
      const res = await fetch(`/api/runs/${run.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: run.finalDraft.id,
          decision,
          note: notes[run.runId] || undefined,
        }),
      });
      const data = await res.json();
      if (!data.entry) return;

      const newStatus: Draft["status"] = decision === "approve" ? "approved" : "rejected";
      setFloor((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          auditLog: [...prev.auditLog, data.entry],
          runs: prev.runs.map((r) =>
            r.runId === run.runId
              ? {
                  ...r,
                  finalDraft: { ...r.finalDraft, status: newStatus },
                  drafts: r.drafts.map((d) =>
                    d.id === r.finalDraft.id ? { ...d, status: newStatus } : d
                  ),
                }
              : r
          ),
        };
      });
      setVisibleCount((c) => c + 1);
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Scout{" "}
          <span className="text-neutral-500 font-normal">
            — an AI SDR floor, governed through Band
          </span>
        </h1>
        {integrations && (
          <div className="flex items-center gap-3 flex-wrap">
            {INTEGRATION_LABELS.map(({ key, label }) => {
              const live = integrations[key];
              return (
                <div
                  key={key}
                  className="flex items-center gap-1.5 text-xs"
                  title={live ? `${label}: live` : `${label}: not configured — using cached fallback`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-neutral-700"}`} />
                  <span className={live ? "text-neutral-300" : "text-neutral-600"}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* Give the floor a goal — the only input the human provides. */}
      <div className="border-b border-neutral-800 px-6 py-5">
        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Give the floor a goal
        </label>
        <div className="flex gap-3 flex-wrap">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !running && runTheFloor()}
            placeholder={EXAMPLE_GOAL}
            className="flex-1 min-w-[280px] rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2.5 text-sm outline-none focus:border-sky-600 transition"
          />
          <button
            onClick={runTheFloor}
            disabled={running || !goal.trim()}
            className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium px-6 py-2.5 transition"
          >
            {running ? "Floor is working…" : "Run the floor"}
          </button>
        </div>

        {floor && (
          <p className="text-xs text-neutral-500 mt-3">
            Prospector built {floor.runs.length + floor.skipped.length} account
            {floor.runs.length + floor.skipped.length === 1 ? "" : "s"} in {floor.goal.city},{" "}
            {floor.goal.region} from{" "}
            <span className={floor.prospecting.live ? "text-emerald-400" : "text-neutral-400"}>
              {floor.prospecting.live ? `${floor.prospecting.sourceLabel} — live web data` : floor.prospecting.sourceLabel}
            </span>
            .
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-190px)]">
        {/* LEFT: the work — accounts, cited signals, drafts */}
        <section className="border-r border-neutral-800 p-6 space-y-4">
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide">The work</h2>

          {!floor && (
            <p className="text-sm text-neutral-600">
              State an outcome. The floor finds the accounts, cites a reason to reach out, drafts the
              outreach, and brings you only what needs your judgment.
            </p>
          )}

          {awaitingApproval.length > 0 && (
            <div className="rounded-lg border border-amber-700 bg-amber-500/5 p-4 space-y-3">
              <div className="text-sm text-amber-300 font-medium">
                {awaitingApproval.length} account{awaitingApproval.length === 1 ? "" : "s"} escalated to
                you — the Manager has no authority to send these.
              </div>
            </div>
          )}

          {revealedRuns.map((run) => (
            <AccountCard
              key={run.runId}
              run={run}
              note={notes[run.runId] ?? ""}
              onNote={(v) => setNotes((n) => ({ ...n, [run.runId]: v }))}
              onDecide={(d) => decide(run, d)}
              deciding={deciding === run.runId}
              canDecide={revealDone}
            />
          ))}

          {revealDone &&
            floor?.skipped.map((s) => (
              <div key={s.accountId} className="rounded-lg border border-neutral-800 border-dashed p-4">
                <div className="text-sm text-neutral-400 font-medium">{s.accountName}</div>
                <p className="text-xs text-neutral-600 mt-1">Skipped — {s.reason}</p>
              </div>
            ))}
        </section>

        {/* RIGHT: governance timeline */}
        <section className="p-6">
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
            Governance timeline
          </h2>
          {!floor && (
            <p className="text-sm text-neutral-600">
              Every delegation, handoff, veto, escalation, and approval — with the authority rule that
              fired — streams here as it happens.
            </p>
          )}
          <ol className="space-y-3">
            {visibleLog.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function AccountCard({
  run,
  note,
  onNote,
  onDecide,
  deciding,
  canDecide,
}: {
  run: PipelineResult;
  note: string;
  onNote: (v: string) => void;
  onDecide: (d: "approve" | "reject") => void;
  deciding: boolean;
  canDecide: boolean;
}) {
  const { account, signal, finalDraft } = run;
  const needsMe = run.requiresHuman && finalDraft.status === "escalated";

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        needsMe ? "border-amber-700 bg-amber-500/5" : "border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium">{account.name}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              account.valueTier === "high_value"
                ? "bg-amber-500/20 text-amber-300"
                : "bg-neutral-800 text-neutral-400"
            }`}
          >
            {account.valueTier === "high_value" ? "high value" : "routine"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
            {finalDraft.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        {account.city}, {account.region} · est. ${account.estValueUsd.toLocaleString()}
      </div>

      {/* The "why now", with receipts. */}
      <div className="rounded-md bg-neutral-900/60 border border-neutral-800 p-3 space-y-2">
        <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
          Why now · {signal.type.replace("_", " ")} · strength {signal.strength}
        </div>
        <p className="text-sm text-neutral-200">{signal.summary}</p>
        {signal.sourceQuote && (
          <blockquote className="text-xs italic text-neutral-500 border-l-2 border-neutral-700 pl-3">
            &ldquo;{signal.sourceQuote}&rdquo;
          </blockquote>
        )}
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-sky-400 hover:underline break-all block"
        >
          {signal.sourceUrl}
        </a>
      </div>

      <details className="group" open={needsMe}>
        <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-200">
          Draft ({run.drafts.length > 1 ? `${run.drafts.length} versions — Compliance forced a revision` : "1 version"})
        </summary>
        <pre className="whitespace-pre-wrap text-sm font-sans text-neutral-200 mt-2 rounded-md bg-neutral-900/60 border border-neutral-800 p-3">
          {finalDraft.body}
        </pre>
      </details>

      {needsMe && (
        <div className="space-y-2 pt-1">
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="optional note…"
            className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onDecide("approve")}
              disabled={deciding || !canDecide}
              className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 transition"
            >
              Approve &amp; send
            </button>
            <button
              onClick={() => onDecide("reject")}
              disabled={deciding || !canDecide}
              className="flex-1 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium py-2 transition"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTOR_META[entry.actor];
  const badge = actionBadge(entry.action);
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-800 p-3 animate-[fadeIn_0.3s_ease-out]">
      <div className={`text-lg ${meta.color}`}>{meta.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>
            {badge.label}
          </span>
          {entry.accountName && (
            <span className="text-[10px] text-neutral-500">{entry.accountName}</span>
          )}
          {entry.authorityRule && (
            <span className="text-[10px] text-neutral-600 font-mono">{entry.authorityRule}</span>
          )}
        </div>
        <p className="text-sm text-neutral-300 mt-1">{entry.detail}</p>
      </div>
    </li>
  );
}
