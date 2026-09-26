// Pricey over iMessage, through Photon Spectrum.
// A thin relay: every text (and photo, and location pin) goes to the Pricey website
// (/api/text); the reply comes back here, with a tapback and, the first time, Pricey's
// contact card. Every minute it also asks the website for texts to send first (deal alerts,
// price changes on tracked items, "still $3.99?" check-ins) and delivers them.
//
//   npm start             real iMessage line (needs PROJECT_ID / PROJECT_SECRET)
//   npm run terminal      chat in this terminal instead, no phone needed
import { Spectrum, type Space } from "spectrum-ts";
import { imessage, nativeContactCard } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const PRICEY_URL = (process.env.PRICEY_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.TEXT_BOT_SECRET ?? "";
const OUTBOX_MS = Number(process.env.OUTBOX_SECONDS ?? 60) * 1000;
const MAX_ATTACHMENT = 6 * 1024 * 1024; // the website accepts about 4.5 MB of photo after encoding
const useTerminal = process.argv.includes("--terminal");

if (!SECRET) throw new Error("Set TEXT_BOT_SECRET in bot/.env (same value as in Vercel).");
if (!useTerminal && !(process.env.PROJECT_ID && process.env.PROJECT_SECRET)) {
  throw new Error("Set PROJECT_ID and PROJECT_SECRET in bot/.env, or run `npm run terminal` to test without a phone.");
}

// Opens an existing conversation by id (iMessage only), for texts Pricey sends first.
type OpenSpace = (id: string) => Promise<Space>;

async function connect() {
  try {
    if (useTerminal) {
      const app = await Spectrum({ providers: [terminal.config()] });
      return { app, openSpace: null as OpenSpace | null };
    }
    const app = await Spectrum({ projectId: process.env.PROJECT_ID!, projectSecret: process.env.PROJECT_SECRET!, providers: [imessage.config()] });
    const im = imessage(app);
    return { app, openSpace: ((id: string) => im.space.get(id)) as OpenSpace | null };
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

const { app, openSpace } = await connect();
const auth = { Authorization: `Bearer ${SECRET}` };

type Reply = { reply: string; react?: string | null; contactCard?: boolean };
type Attachment = { mimeType: string; name?: string; data: string };

async function askPricey(from: string, spaceId: string, text: string, attachments: Attachment[]): Promise<Reply> {
  try {
    const res = await fetch(`${PRICEY_URL}/api/text`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ from, spaceId, text, attachments }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return await res.json();
  } catch (e) {
    console.error("Pricey API failed:", e);
    return { reply: "Pricey is having a moment. Try again in a minute!" };
  }
}

// Conversations we've seen this session, so first-texts reuse them directly.
const spaces = new Map<string, Space>();

async function spaceFor(id: string): Promise<Space | null> {
  if (spaces.has(id)) return spaces.get(id)!;
  if (!openSpace) return null;
  try {
    const space = await openSpace(id);
    spaces.set(id, space);
    return space;
  } catch (e) {
    console.error("Could not open conversation", id.slice(0, 12), e);
    return null;
  }
}

let checking = false;
async function deliverOutbox() {
  if (checking) return;
  checking = true;
  try {
    const res = await fetch(`${PRICEY_URL}/api/text/outbox`, { headers: auth, signal: AbortSignal.timeout(50_000) });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const { texts } = (await res.json()) as { texts: { spaceId: string; text: string; kind: string }[] };
    for (const t of texts) {
      const space = await spaceFor(t.spaceId);
      if (!space) continue;
      await space.send(t.text);
      console.log(`Sent ${t.kind} text`);
    }
  } catch (e) {
    console.error("Outbox check failed:", e instanceof Error ? e.message : e);
  } finally {
    checking = false;
  }
}
setInterval(deliverOutbox, OUTBOX_MS);

console.log(`Pricey relay running (${useTerminal ? "terminal" : "iMessage"}) -> ${PRICEY_URL}`);

for await (const [space, message] of app.messages) {
  if (message.direction !== "inbound") continue;
  const content = message.content;
  let text = "";
  const attachments: Attachment[] = [];
  if (content.type === "text") text = content.text;
  else if (content.type === "attachment") {
    // Receipt photos and shared location pins.
    try {
      if ((content.size ?? 0) <= MAX_ATTACHMENT) {
        const bytes = Buffer.from(await content.read());
        if (bytes.length <= MAX_ATTACHMENT) attachments.push({ mimeType: content.mimeType, name: content.name, data: bytes.toString("base64") });
        else text = "(sent a photo that was too large)";
      } else text = "(sent a photo that was too large)";
    } catch (e) {
      console.error("Could not read attachment:", e);
      continue;
    }
  } else continue; // reactions, typing, and so on need no reply

  const from = message.sender?.id ?? space.id;
  spaces.set(space.id, space);
  const r = await app.responding(space, () => askPricey(from, space.id, text, attachments));
  await space.send(r.reply);
  if (r.react) await message.react(r.react).catch((e: unknown) => console.error("Tapback failed:", e));
  if (r.contactCard && !useTerminal) await space.send(nativeContactCard()).catch((e: unknown) => console.error("Contact card failed:", e));
}
