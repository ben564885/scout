import crypto from "crypto";

// Twilio REST transport for Scout's text-in/text-out channel (PRD §6.3:
// "Band = brain, iMessage = mouth" — this is purely the mouth. Governance
// decisions still flow through lib/band.ts / lib/pipeline.ts; this file only
// moves bytes to and from Ben's phone).
//
// Clean-room per PRD §10 IP hygiene: built fresh against Twilio's public
// REST API, not adapted from the Hermes/Inkbox iMessage bridge.

const API_BASE = "https://api.twilio.com/2010-04-01";

// Channel toggle: US SMS numbers need A2P 10DLC (local) or toll-free
// verification before they can deliver, and both were still pending review
// on the hackathon day this shipped. WhatsApp's sandbox needs no business
// verification at all and works immediately with the same Twilio
// credentials, so "whatsapp" is the fast unblock — flip TWILIO_CHANNEL back
// to "sms" (the default) once a real number clears verification; no other
// code change needed.
type Channel = "sms" | "whatsapp";

function channel(): Channel {
  return process.env.TWILIO_CHANNEL === "whatsapp" ? "whatsapp" : "sms";
}

function fromNumber(): string | undefined {
  return channel() === "whatsapp" ? process.env.TWILIO_WHATSAPP_NUMBER : process.env.TWILIO_PHONE_NUMBER;
}

function withChannelPrefix(e164: string): string {
  return channel() === "whatsapp" ? `whatsapp:${e164}` : e164;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && fromNumber() && process.env.TWILIO_OWNER_PHONE_NUMBER
  );
}

export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = fromNumber();
  if (!sid || !token || !from) {
    console.warn("[twilio] not configured, skipping send");
    return;
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetch(`${API_BASE}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Twilio splits/rejoins long SMS bodies automatically (up to ~1600
      // chars); WhatsApp has its own ~4096-char limit, so 1600 is safe either way.
      body: new URLSearchParams({
        To: withChannelPrefix(to),
        From: withChannelPrefix(from),
        Body: body.slice(0, 1600),
      }).toString(),
    });
    if (!res.ok) {
      console.warn("[twilio] send failed:", res.status, await res.text());
    }
  } catch (error) {
    console.warn("[twilio] send threw (non-fatal):", error);
  }
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

// Twilio's documented request-validation algorithm: sort the POST params by
// key, append each key+value directly to the full request URL, HMAC-SHA1
// with the Auth Token, base64-encode, compare to X-Twilio-Signature.
// https://www.twilio.com/docs/usage/security#validating-requests
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string
): boolean {
  if (!signatureHeader) return false;
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === givenBuf.length && crypto.timingSafeEqual(expectedBuf, givenBuf);
}
