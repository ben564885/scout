import { Client } from "ssh2";

// Emergency same-day fallback notify channel (2026-07-13): Scout's own
// Twilio numbers are all stuck in carrier verification (A2P 10DLC / toll-free
// review), so outbound texts to Ben instead go out via his personal
// Hermes/Inkbox agent's iMessage send path — over SSH, using a dedicated
// keypair that is locked to a single forced command on the server side
// (see authorized_keys on hermes-box): it can ONLY ever run
// `scoutctl.py notify-stdin`, regardless of what command this client asks
// for. That's what makes this safe to hold as a Vercel env var — a leaked
// key can send Ben a text and nothing else.
//
// This does not touch or import anything from the personal agent's own
// tooling (mailctl.py/ccctl.py/SOUL.md) — scoutctl.py is a new, standalone
// script written specifically for Scout.

export function hermesNotifyConfigured(): boolean {
  return Boolean(
    process.env.HERMES_SSH_HOST && process.env.HERMES_SSH_USER && process.env.HERMES_SSH_PRIVATE_KEY
  );
}

export async function sendViaHermesSsh(text: string): Promise<void> {
  const host = process.env.HERMES_SSH_HOST;
  const username = process.env.HERMES_SSH_USER;
  const rawKey = process.env.HERMES_SSH_PRIVATE_KEY;
  if (!host || !username || !rawKey) {
    console.warn("[hermes-notify] not configured, skipping send");
    return;
  }
  // Vercel env vars are single-line; the key is stored with literal "\n"
  // sequences and reconstructed here.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  await new Promise<void>((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("hermes-notify SSH timed out"));
    }, 15_000);

    conn
      .on("ready", () => {
        // The requested command is irrelevant — the server-side forced
        // command always runs scoutctl.py notify-stdin instead.
        conn.exec("scout-notify", (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }
          stream
            .on("close", () => {
              clearTimeout(timer);
              conn.end();
              resolve();
            })
            .on("data", () => {})
            .stderr.on("data", () => {});
          stream.end(text);
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({ host, username, privateKey, readyTimeout: 10_000 });
  });
}
