"use client";

import { useEffect, useMemo, useState } from "react";
import { AuditLogEntry, Draft, FloorRun, PipelineResult } from "@/lib/types";
import { ACTOR_META, actionBadge } from "@/lib/actor-meta";
import { LogoMark, SheenButton } from "@/components/Brand";
import SettingsModal from "@/components/SettingsModal";
import PipelineFlow from "@/components/PipelineFlow";
import { SponsorLogo } from "@/components/SponsorLogo";

type IntegrationStatus = Record<"insforge" | "nimble" | "youdotcom" | "band" | "hydra" | "kylon", boolean>;

const REVEAL_INTERVAL_MS = 450;

const EXAMPLE_GOAL = "Find used-car dealerships in the Bay Area worth reaching out to this week";

export default function GovernanceBoard() {
  const [goal, setGoal] = useState(EXAMPLE_GOAL);
  const [floor, setFloor] = useState<FloorRun | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <div className="min-h-screen bg-white text-black">
      {/* Nav — mirrors the landing page header exactly */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-px bg-black/10 md:grid-cols-2">
        <div className="flex items-center gap-3 bg-white px-6 py-4 md:px-10">
          <LogoMark />
          <span className="font-display text-lg font-bold tracking-tight">scout.</span>
        </div>
        <div className="flex items-center justify-end bg-white px-6 py-4 md:px-10">
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center border border-black transition-colors hover:bg-black hover:text-white"
          >
            <GearIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px]">
        {/* Give the floor a goal — the only input the human provides. */}
        <div className="border-b border-black/10 px-6 py-6 md:px-10">
          <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
            Give the floor a goal
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !running && runTheFloor()}
              placeholder={EXAMPLE_GOAL}
              className="min-w-[280px] flex-1 rounded-full border border-black/15 px-5 py-2.5 text-sm outline-none transition-colors focus:border-black"
            />
            <SheenButton
              onClick={runTheFloor}
              disabled={running || !goal.trim()}
              className="rounded-full bg-black px-6 py-2.5 font-display text-xs uppercase tracking-[0.2em] text-white"
              sheenClassName="bg-white/25"
            >
              {running ? "Floor is working…" : "Run the floor"}
            </SheenButton>
          </div>

          {floor && (
            <p className="mt-3 text-xs text-black/45">
              Prospector built {floor.runs.length + floor.skipped.length} account
              {floor.runs.length + floor.skipped.length === 1 ? "" : "s"} in {floor.goal.city},{" "}
              {floor.goal.region} from{" "}
              <span className={floor.prospecting.live ? "text-emerald-600" : "text-black/45"}>
                {floor.prospecting.live ? `${floor.prospecting.sourceLabel} — live web data` : floor.prospecting.sourceLabel}
              </span>
              .
            </p>
          )}

        </div>

        {/* Before there's a run to show, the pipeline flowchart fills the
            space where the work and the governance timeline will land —
            live sponsors doing the work, instead of two empty placeholders. */}
        {!floor && <PipelineFlow integrations={integrations} running={running} />}

        {floor && (
          <>
            {/* The work — accounts, cited signals, drafts, one full-width pill each */}
            <section className="space-y-4 border-b border-black/10 bg-white p-6 md:p-10">
              <h2 className="font-display text-xs uppercase tracking-[0.25em] text-black/45">
                The work
              </h2>

              {awaitingApproval.length > 0 && (
                <div className="rounded-2xl border border-black bg-amber-50 p-4">
                  <p className="font-display text-xs uppercase tracking-wide text-black">
                    {awaitingApproval.length} account{awaitingApproval.length === 1 ? "" : "s"} escalated
                    to you — the Manager has no authority to send these.
                  </p>
                </div>
              )}

              {revealedRuns.map((run) => (
                <AccountCard
                  key={run.runId}
                  run={run}
                  integrations={integrations}
                  note={notes[run.runId] ?? ""}
                  onNote={(v) => setNotes((n) => ({ ...n, [run.runId]: v }))}
                  onDecide={(d) => decide(run, d)}
                  deciding={deciding === run.runId}
                  canDecide={revealDone}
                />
              ))}

              {revealDone &&
                floor?.skipped.map((s) => (
                  <div key={s.accountId} className="rounded-full border border-dashed border-black/15 px-5 py-3">
                    <span className="font-display text-xs uppercase tracking-wide text-black/45">
                      {s.accountName}
                    </span>
                    <span className="ml-2 text-xs text-black/40">Skipped — {s.reason}</span>
                  </div>
                ))}
            </section>

            {/* Governance timeline — streams below the results, full width */}
            <section className="bg-white p-6 md:p-10">
              <h2 className="mb-3 font-display text-xs uppercase tracking-[0.25em] text-black/45">
                Governance timeline
              </h2>
              <ol className="space-y-3">
                {visibleLog.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          </>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// Which sponsors actually did work on this result, so every pill can show
// its own receipts instead of one static logo strip for the whole floor.
// Nimble/Band/InsForge are the backbone of every run; You.com only lit up
// if the Researcher's audit trail shows it was actually called.
const SPONSOR_ICONS: Record<string, { src: string; alt: string; fit?: "cover" | "contain" }> = {
  nimble: { src: "/nimble.svg", alt: "Nimble", fit: "contain" },
  youdotcom: { src: "/you.jpg", alt: "You.com" },
  band: { src: "/band.svg", alt: "Band", fit: "contain" },
  insforge: { src: "/insforge.png", alt: "InsForge" },
};

function AccountCard({
  run,
  integrations,
  note,
  onNote,
  onDecide,
  deciding,
  canDecide,
}: {
  run: PipelineResult;
  integrations: Record<string, boolean> | null;
  note: string;
  onNote: (v: string) => void;
  onDecide: (d: "approve" | "reject") => void;
  deciding: boolean;
  canDecide: boolean;
}) {
  const { account, signal, finalDraft } = run;
  const needsMe = run.requiresHuman && finalDraft.status === "escalated";

  const usedYouCom = run.auditLog.some((e) => e.authorityRule === "researcher:supplement_with_youdotcom");
  const sponsorKeys = ["nimble", ...(usedYouCom ? ["youdotcom"] : []), "band", "insforge"];

  return (
    <div
      className={`space-y-3 rounded-[28px] border bg-white p-5 transition-colors md:p-6 ${
        needsMe ? "border-black shadow-[0_1px_0_0_rgba(0,0,0,0.05)]" : "border-black/10"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-bold uppercase tracking-wide">{account.name}</span>
        <span
          className={`rounded-full px-3 py-1 font-display text-[10px] uppercase tracking-wide ${
            account.valueTier === "high_value" ? "bg-black text-white" : "border border-black/15 text-black/45"
          }`}
        >
          {account.valueTier === "high_value" ? "high value" : "routine"}
        </span>
        <span className="rounded-full border border-black/15 px-3 py-1 font-display text-[10px] uppercase tracking-wide text-black/60">
          {finalDraft.status.replace("_", " ")}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {sponsorKeys.map((key) => {
            const icon = SPONSOR_ICONS[key];
            const live = integrations?.[key] !== false;
            return <SponsorLogo key={key} src={icon.src} alt={icon.alt} fit={icon.fit} live={live} size={24} />;
          })}
        </span>
      </div>

      <div className="text-xs text-black/45">
        {account.city}, {account.region} · est. ${account.estValueUsd.toLocaleString()}
      </div>

      {/* The "why now", with receipts. */}
      <div className="space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-4">
        <div className="font-display text-[10px] uppercase tracking-wide text-black/45">
          Why now · {signal.type.replace("_", " ")} · strength {signal.strength}
        </div>
        <p className="text-sm text-black/80">{signal.summary}</p>
        {signal.sourceQuote && (
          <blockquote className="border-l-2 border-black/20 pl-3 text-sm text-black/60">
            &ldquo;{signal.sourceQuote}&rdquo;
          </blockquote>
        )}
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="block break-all text-xs text-black/50 hover:text-black hover:underline"
        >
          {signal.sourceUrl}
        </a>
      </div>

      <details className="group" open={needsMe}>
        <summary className="cursor-pointer font-display text-[10px] uppercase tracking-wide text-black/45 hover:text-black">
          Draft ({run.drafts.length > 1 ? `${run.drafts.length} versions — Compliance forced a revision` : "1 version"})
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-black/10 bg-neutral-50 p-4 font-sans text-sm text-black/80">
          {finalDraft.body}
        </pre>
      </details>

      {needsMe && (
        <div className="space-y-2 pt-1">
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="optional note…"
            className="w-full rounded-full border border-black/15 px-4 py-2 text-sm outline-none transition-colors focus:border-black"
          />
          <div className="flex gap-2">
            <SheenButton
              onClick={() => onDecide("approve")}
              disabled={deciding || !canDecide}
              className="flex-1 justify-center rounded-full bg-black py-2.5 font-display text-xs uppercase tracking-wide text-white"
              sheenClassName="bg-white/25"
            >
              Approve &amp; send
            </SheenButton>
            <button
              onClick={() => onDecide("reject")}
              disabled={deciding || !canDecide}
              className="flex-1 rounded-full border border-black py-2.5 font-display text-xs uppercase tracking-wide transition-colors hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TimelineRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTOR_META[entry.actor];
  const badge = actionBadge(entry.action);
  return (
    <li className="flex gap-3 rounded-xl border border-black/10 p-3 animate-[fadeIn_0.3s_ease-out]">
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center ${meta.color}`}>
        <meta.icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-display text-xs uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
          <span className={`rounded-full px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
            {badge.label}
          </span>
          {entry.accountName && (
            <span className="font-display text-[10px] uppercase tracking-wide text-black/40">
              {entry.accountName}
            </span>
          )}
          {entry.authorityRule && (
            <span className="font-mono text-[10px] text-black/35">{entry.authorityRule}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-black/70">{entry.detail}</p>
      </div>
    </li>
  );
}
