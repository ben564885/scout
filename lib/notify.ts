import { FloorRun, PipelineResult } from "./types";

// Builds the two "done" notifications Ben receives when a floor run
// completes: a short SMS (lib/twilio.ts) and a fuller HTML email. Email goes
// through a *separate* InsForge project's env vars (INSFORGE_EMAIL_*) from
// the main app's (INSFORGE_BASE_URL/API_KEY) — custom email requires a paid
// InsForge plan and Scout's main project is on free tier, so a second,
// dedicated Pro-plan project sends the report without touching the app's
// real data/backend.

export function floorSummaryText(floor: FloorRun): string {
  const escalated = floor.runs.filter((r) => r.requiresHuman);
  const autoApproved = floor.runs.length - escalated.length;
  const lines = [
    `scout floor done: "${floor.goal.raw}"`,
    `${floor.runs.length} accounts run, ${autoApproved} auto-approved, ${escalated.length} escalated, ${floor.skipped.length} skipped.`,
  ];
  if (escalated.length) {
    lines.push(
      `needs your approval: ${escalated.map((r) => r.account.name).join(", ")} — reply approve or reject.`
    );
  }
  lines.push("full report emailed.");
  return lines.join(" ");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function accountSectionHtml(run: PipelineResult): string {
  return `
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #ddd;">
      <h3 style="margin:0 0 4px;">${escapeHtml(run.account.name)}
        <span style="font-weight:normal;color:#666;">(${run.account.valueTier.replace("_", " ")}, est. $${run.account.estValueUsd.toLocaleString()})</span>
      </h3>
      <p style="margin:4px 0;"><strong>Why now:</strong> ${escapeHtml(run.signal.summary)}<br/>
        <a href="${run.signal.sourceUrl}">${escapeHtml(run.signal.sourceUrl)}</a> — &ldquo;${escapeHtml(run.signal.sourceQuote)}&rdquo;</p>
      <p style="margin:4px 0;"><strong>Draft:</strong><br/>${escapeHtml(run.finalDraft.body).replace(/\n/g, "<br/>")}</p>
      <p style="margin:4px 0;"><strong>Status:</strong> ${run.finalDraft.status}${
    run.requiresHuman ? " — escalated, needs your approval (reply approve/reject by text)" : ""
  }</p>
    </div>`;
}

export function floorReportHtml(floor: FloorRun): string {
  const skippedHtml = floor.skipped.length
    ? `<h3>Skipped (no substantiable "why now")</h3><ul>${floor.skipped
        .map((s) => `<li>${escapeHtml(s.accountName)} — ${escapeHtml(s.reason)}</li>`)
        .join("")}</ul>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:640px;color:#111;">
      <h2 style="margin-bottom:4px;">Scout floor report</h2>
      <p style="color:#666;margin-top:0;">${escapeHtml(floor.goal.raw)}</p>
      <p>${floor.runs.length} account${floor.runs.length === 1 ? "" : "s"} run · ${
    floor.prospecting.live ? "live Nimble pull" : `cached (${escapeHtml(floor.prospecting.sourceLabel)})`
  }</p>
      ${floor.runs.map(accountSectionHtml).join("")}
      ${skippedHtml}
    </div>`;
}

export async function sendFloorReportEmail(floor: FloorRun): Promise<void> {
  const baseUrl = process.env.INSFORGE_EMAIL_BASE_URL;
  const anonKey = process.env.INSFORGE_EMAIL_ANON_KEY;
  const to = process.env.SCOUT_REPORT_EMAIL_TO;
  if (!baseUrl || !anonKey || !to) {
    console.warn("[notify] email not configured, skipping report send");
    return;
  }
  try {
    const res = await fetch(`${baseUrl}/api/email/send-raw`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject: `Scout floor report — ${floor.goal.raw}`,
        html: floorReportHtml(floor),
        from: "Scout",
      }),
    });
    if (!res.ok) {
      console.warn("[notify] report email failed:", res.status, await res.text());
    }
  } catch (error) {
    console.warn("[notify] report email threw (non-fatal):", error);
  }
}
