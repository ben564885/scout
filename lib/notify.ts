import { FloorRun, PipelineResult } from "./types";
import { sendSms } from "./twilio";
import { sendViaHermesSsh } from "./hermes-notify";

// Builds the two "done" notifications Ben receives when a floor run
// completes: a short SMS (lib/twilio.ts) and a fuller HTML email. Email goes
// through a *separate* InsForge project's env vars (INSFORGE_EMAIL_*) from
// the main app's (INSFORGE_BASE_URL/API_KEY) — custom email requires a paid
// InsForge plan and Scout's main project is on free tier, so a second,
// dedicated Pro-plan project sends the report without touching the app's
// real data/backend.

// Outbound text channel toggle (2026-07-13): NOTIFY_CHANNEL=hermes-ssh routes
// through lib/hermes-notify.ts (the emergency same-day fallback, since
// Scout's own Twilio numbers are stuck in carrier verification) instead of
// Twilio SMS/WhatsApp. Flip back to "twilio" (the default) once a real
// number clears verification — no other code change needed.
export async function notifyOwner(text: string): Promise<void> {
  if (process.env.NOTIFY_CHANNEL === "hermes-ssh") {
    await sendViaHermesSsh(text);
    return;
  }
  const owner = process.env.TWILIO_OWNER_PHONE_NUMBER;
  if (owner) await sendSms(owner, text);
}

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

// Status badge styling per draft status — every color pair is an inline
// style (email clients, especially Gmail's app, strip <style> blocks and
// several CSS properties, so nothing here relies on anything but inline
// style="" attributes and table-based layout).
const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  auto_approved: { label: "auto-approved", bg: "#d1fae5", fg: "#065f46" },
  approved: { label: "approved", bg: "#d1fae5", fg: "#065f46" },
  escalated: { label: "needs your approval", bg: "#fef3c7", fg: "#92400e" },
  rejected: { label: "rejected", bg: "#fee2e2", fg: "#991b1b" },
  sent: { label: "sent", bg: "#dbeafe", fg: "#1e40af" },
  pending: { label: "pending", bg: "#f3f4f6", fg: "#374151" },
  vetoed: { label: "vetoed", bg: "#fee2e2", fg: "#991b1b" },
  revised: { label: "revised", bg: "#f3f4f6", fg: "#374151" },
};

function badgeHtml(status: string): string {
  const s = STATUS_BADGE[status] ?? { label: status, bg: "#f3f4f6", fg: "#374151" };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;background-color:${s.bg};color:${s.fg};white-space:nowrap;">${escapeHtml(s.label)}</span>`;
}

function accountSectionHtml(run: PipelineResult): string {
  const draftHtml = escapeHtml(run.finalDraft.body).replace(/\n/g, "<br/>");
  return `
<tr><td style="padding:0 32px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
    <tr><td style="padding:18px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:15px;font-weight:700;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(run.account.name)}</td>
        <td align="right">${badgeHtml(run.finalDraft.status)}</td>
      </tr></table>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${run.account.valueTier.replace("_", " ")} · est. $${run.account.estValueUsd.toLocaleString()}</p>

      <p style="margin:14px 0 0;color:#111827;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><strong>Why now:</strong> ${escapeHtml(run.signal.summary)}</p>
      <p style="margin:4px 0 0;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><a href="${run.signal.sourceUrl}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(run.signal.sourceUrl)}</a></p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:12px;font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">&ldquo;${escapeHtml(run.signal.sourceQuote)}&rdquo;</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:6px;">
        <tr><td style="padding:12px 14px;">
          <p style="margin:0 0 6px;color:#9ca3af;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Draft</p>
          <p style="margin:0;color:#111827;font-size:13px;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${draftHtml}</p>
        </td></tr>
      </table>

      ${
        run.requiresHuman
          ? `<p style="margin:12px 0 0;color:#92400e;font-size:12px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Reply "approve" or "reject" to decide this one.</p>`
          : ""
      }
    </td></tr>
  </table>
</td></tr>`;
}

function skippedSectionHtml(floor: FloorRun): string {
  if (!floor.skipped.length) return "";
  const rows = floor.skipped
    .map(
      (s) =>
        `<p style="margin:0 0 6px;color:#6b7280;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><strong style="color:#374151;">${escapeHtml(s.accountName)}</strong> — ${escapeHtml(s.reason)}</p>`
    )
    .join("");
  return `
<tr><td style="padding:0 32px 24px;">
  <p style="margin:0 0 8px;color:#9ca3af;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Skipped — no substantiable "why now"</p>
  ${rows}
</td></tr>`;
}

export function floorReportHtml(floor: FloorRun): string {
  const sourceLabel = floor.prospecting.live
    ? "live Nimble pull"
    : `cached (${escapeHtml(floor.prospecting.sourceLabel)})`;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Scout floor report</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="background-color:#111827;padding:22px 32px;">
              <span style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.02em;font-family:${font};">Scout</span>
              <span style="color:#9ca3af;font-size:13px;margin-left:8px;font-family:${font};">floor report</span>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 20px;">
              <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;font-family:${font};">Goal</p>
              <p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;font-family:${font};">&ldquo;${escapeHtml(floor.goal.raw)}&rdquo;</p>
              <p style="margin:10px 0 0;color:#6b7280;font-size:12px;font-family:${font};">${floor.runs.length} account${floor.runs.length === 1 ? "" : "s"} run · ${sourceLabel}</p>
            </td>
          </tr>
          ${floor.runs.map(accountSectionHtml).join("")}
          ${skippedSectionHtml(floor)}
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:11px;font-family:${font};">Sent by Scout — automated outreach report</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
