import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleIncomingText } from "@/lib/text-command";

// Same-day emergency fallback channel (2026-07-13): Scout's own Twilio
// numbers are stuck in carrier verification (A2P 10DLC / toll-free review),
// so Ben's PRD's no-lifted-Hermes/Inkbox-bridge rule is explicitly waived
// for today by Ben himself. This endpoint is called by a fresh, standalone
// script (scoutctl.py) on Ben's personal Hermes-agent droplet — not by
// Twilio — so it authenticates with a shared secret instead of a Twilio
// signature, but runs through the *exact same* handleIncomingText logic as
// app/api/sms/route.ts. Texting is still last-mile delivery only; Band
// still makes every governance decision.
//
// Only Ben's own agent (which only Ben can text) knows the secret and can
// reach this route, so there's no separate phone-number allowlist check
// here the way app/api/sms/route.ts has one for Twilio.

export const maxDuration = 120;

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const expected = process.env.SCOUT_RELAY_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "relay not configured" }, { status: 503 });
  }

  const given = req.headers.get("x-scout-relay-secret");
  if (!given || !timingSafeEqualStrings(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { body } = await req.json();
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "missing body" }, { status: 400 });
  }

  const reply = await handleIncomingText(body.trim());
  return NextResponse.json({ reply });
}
