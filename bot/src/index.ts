// Pricey over iMessage, through Photon Spectrum.
// A thin relay: every text goes to the Pricey app (/api/text), the reply comes back here.
// All the logic (reports, vouching, Gemini answers) lives in the app, shared with the web.
//
//   bun start             real iMessage line (needs PROJECT_ID / PROJECT_SECRET)
//   bun run terminal      chat in this terminal instead, no phone needed
import { Spectrum, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const PRICEY_URL = (process.env.PRICEY_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.TEXT_BOT_SECRET ?? "";
const DIGEST_MS = Number(process.env.DIGEST_MINUTES ?? 10) * 60_000;
const useTerminal = process.argv.includes("--terminal");

if (!SECRET) throw new Error("Set TEXT_BOT_SECRET in bot/.env (same value as in Vercel).");
if (!useTerminal && !(process.env.PROJECT_ID && process.env.PROJECT_SECRET)) {
  throw new Error("Set PROJECT_ID and PROJECT_SECRET in bot/.env, or run `bun run terminal` to test without a phone.");
}

async function connect() {
  try {
    return useTerminal
      ? await Spectrum({ providers: [terminal.config()] })
      : await Spectrum({ projectId: process.env.PROJECT_ID!, projectSecret: process.env.PROJECT_SECRET!, providers: [imessage.config()] });
  } catch (e) {
    console.error(`
Could not connect to Photon: ${e instanceof Error ? e.message : e}

Check:
  - PROJECT_ID and PROJECT_SECRET in bot/.env match your project at app.photon.codes
    (run npm run setup again to fix them)
  - your phone is added in the Photon dashboard (avatar menu, top right)
  - this computer is online
`);
    process.exit(1);
  }
}

const app = await connect();

const auth = { Authorization: `Bearer ${SECRET}` };

async function askPricey(from: string, text: string): Promise<{ reply: string; action: { subscribe?: string; unsubscribe?: true } | null }> {
  try {
    const res = await fetch(`${PRICEY_URL}/api/text`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ from, text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return await res.json();
  } catch (e) {
    console.error("Pricey API failed:", e);
    return { reply: "Pricey is having a moment. Try again in a minute!", action: null };
  }
}

// People who texted "alerts on": their conversation, borough, and when we last alerted them.
// Kept in memory; if the relay restarts, people just text "alerts on" again.
const subscribers = new Map<string, { space: Space; borough: string; lastSent: number }>();

async function sendDigests() {
  for (const [who, sub] of subscribers) {
    try {
      const url = `${PRICEY_URL}/api/text/digest?borough=${encodeURIComponent(sub.borough)}&since=${sub.lastSent}`;
      const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(15_000) });
      const { text } = (await res.json()) as { text: string | null };
      if (text) {
        await sub.space.send(text);
        sub.lastSent = Date.now();
        console.log(`Alert sent to ${who.slice(0, 6)}...`);
      }
    } catch (e) {
      console.error("Digest failed:", e);
    }
  }
}
setInterval(sendDigests, DIGEST_MS);

console.log(`Pricey relay running (${useTerminal ? "terminal" : "iMessage"}) -> ${PRICEY_URL}`);

for await (const [space, message] of app.messages) {
  if (message.direction !== "inbound" || message.content.type !== "text") continue;
  const from = message.sender?.id ?? space.id;
  const text = message.content.text;
  const { reply, action } = await app.responding(space, () => askPricey(from, text));
  await space.send(reply);

  if (action?.subscribe) {
    // Start from now so the first alert is about something new, not what they just saw.
    subscribers.set(from, { space, borough: action.subscribe, lastSent: Date.now() });
  } else if (action?.unsubscribe) {
    subscribers.delete(from);
  }
}
