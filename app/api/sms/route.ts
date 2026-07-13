import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { recordHumanDecision, runFloor } from "@/lib/pipeline";
import { mirrorApprovalToBand, mirrorRunToBand } from "@/lib/band";
import { getPendingEscalation } from "@/lib/store";
import { normalizePhone, sendSms, verifyTwilioSignature } from "@/lib/twilio";
import { floorSummaryText, sendFloorReportEmail } from "@/lib/notify";

// Twilio's text-in/text-out channel onto the floor. Two things a text can do:
//   1. Any text that isn't "approve"/"reject" is a new goal — same entry
//      point as the web UI's POST /api/goal (runFloor), just triggered by SMS.
//   2. "approve"/"reject" resolves whatever escalation is currently pending,
//      through the exact same recordHumanDecision + mirrorApprovalToBand path
//      app/api/runs/[id]/approve uses — texting is last-mile delivery only
//      (PRD §6.3: "Band = brain, iMessage = mouth"), never a parallel
//      approval mechanism.
//
// Twilio needs a fast response (~15s) to the webhook itself, so the actual
// work runs in the background via `after()` — the same deferred-execution
// pattern already used in api/goal and api/runs/[id]/approve — and results
// go out as separate outbound sends once the run finishes.

export const maxDuration = 120;

function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const ownerNumber = process.env.TWILIO_OWNER_PHONE_NUMBER;
  if (!authToken || !ownerNumber) {
    console.warn("[sms] Twilio env vars not configured, ignoring webhook");
    return twiml();
  }

  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Must match exactly what's configured as the webhook URL in the Twilio
  // console (no query string) for the signature check to pass.
  const url = `https://${req.headers.get("host")}/api/sms`;
  const signature = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(url, params, signature, authToken)) {
    console.warn("[sms] signature verification failed — rejecting");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const from = normalizePhone(params.From ?? "");
  if (from !== normalizePhone(ownerNumber)) {
    console.warn("[sms] ignoring text from non-owner number");
    return twiml();
  }

  const body = (params.Body ?? "").trim();
  if (!body) return twiml();

  const decisionMatch = body.match(/^(approve|reject)\b\s*(.*)$/i);
  if (decisionMatch) {
    const decision = decisionMatch[1].toLowerCase() as "approve" | "reject";
    const note = decisionMatch[2].trim() || undefined;
    const pending = getPendingEscalation();
    if (!pending) {
      return twiml("no pending escalation right now.");
    }

    after(async () => {
      const entry = recordHumanDecision(pending.runId, pending.draftId, decision, note, "imessage");
      if (entry) await mirrorApprovalToBand(pending.runId, entry.detail);
      await sendSms(
        ownerNumber,
        `${decision === "approve" ? "approved" : "rejected"} — ${pending.accountName}. band recorded the decision.`
      );
    });

    return twiml(`on it — ${decision === "approve" ? "approving" : "rejecting"} ${pending.accountName}.`);
  }

  after(async () => {
    const floor = await runFloor(body);
    for (const run of floor.runs) {
      await mirrorRunToBand(run);
    }
    await sendSms(ownerNumber, floorSummaryText(floor));
    await sendFloorReportEmail(floor);
  });

  return twiml(`got it — running the floor on: "${body}". i'll text you when it's done.`);
}
