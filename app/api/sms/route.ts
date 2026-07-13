import { NextRequest, NextResponse } from "next/server";
import { normalizePhone, verifyTwilioSignature } from "@/lib/twilio";
import { handleIncomingText } from "@/lib/text-command";

// Twilio's SMS/WhatsApp webhook onto the floor. Signature-verified, then
// delegates to lib/text-command.ts for the actual approve/reject-vs-new-goal
// logic (shared with app/api/agent-relay/route.ts, the same-day emergency
// fallback channel) — this file only owns Twilio-specific concerns:
// signature verification, form-data parsing, and the TwiML response shape.
//
// Twilio needs a fast response (~15s) to the webhook itself; the actual work
// runs in the background via `after()` inside handleIncomingText, the same
// deferred-execution pattern already used in api/goal and
// api/runs/[id]/approve — results go out as separate outbound sends once
// the run finishes.

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

  const ack = await handleIncomingText(body);
  return twiml(ack);
}
