// Runs the real relay (src/index.ts) against a running Pricey app, with Photon faked out:
// scripted inbound iMessages go in, and we check what the relay sends back.
//   PRICEY_URL=http://localhost:3000 TEXT_BOT_SECRET=... bun test
import { expect, mock, test } from "bun:test";

type Sent = { space: string; content: unknown };
const sent: Sent[] = [];
const reactions: { message: string; glyph: string }[] = [];
const space = (id: string) => ({ id, send: async (content: unknown) => void sent.push({ space: id, content }) });

let n = 0;
const inbound = (from: string, content: Record<string, unknown>) => {
  const id = `m${++n}`;
  return [space(`chat-${from}`), { id, direction: "inbound", sender: { id: from }, content, react: async (glyph: string) => void reactions.push({ message: id, glyph }) }];
};
const textMsg = (from: string, text: string) => inbound(from, { type: "text", text });
const pin = "BEGIN:VCARD\nVERSION:3.0\nN:;Current Location;;;\nitem1.URL;type=pref:http://maps.apple.com/?ll=40.6712,-73.9814&q=40.6712,-73.9814\nEND:VCARD";

const script: unknown[][] = [
  textMsg("+15550001", "hi"),
  textMsg("+15550001", "eggs 3.49 at trader joes union sq"),
  inbound("+15550001", { type: "attachment", mimeType: "text/vcard", name: "Current Location.loc.vcf", read: async () => Buffer.from(pin) }),
  textMsg("+15550002", "hello"),
  textMsg("+15550002", "alerts on brooklyn"),
  [space("chat-x"), { id: "out", direction: "outbound", sender: { id: "me" }, content: { type: "text", text: "ignored echo" }, react: async () => {} }],
  textMsg("+15550001", "free pizza at myrtle deli until 3pm"),
];

const fakeApp = {
  messages: (async function* () {
    for (const m of script) {
      yield m;
      await new Promise((r) => setTimeout(r, 80));
    }
  })(),
  send: async () => undefined,
  responding: async (_s: unknown, fn: () => unknown) => await fn(),
};
mock.module("spectrum-ts", () => ({ Spectrum: async () => fakeApp }));
mock.module("spectrum-ts/providers/imessage", () => ({ imessage: Object.assign(() => ({ space: { get: async (id: string) => space(id) } }), { config: () => ({}) }), nativeContactCard: () => ({ type: "contact-card" }) }));
mock.module("spectrum-ts/providers/terminal", () => ({ terminal: { config: () => ({}) } }));

const texts = (who: string) => sent.filter((s) => s.space === `chat-${who}` && typeof s.content === "string").map((s) => s.content as string);

test("relay: replies, tapbacks, contact card, location pin, bundled alerts", async () => {
  process.env.OUTBOX_SECONDS = "1"; // check for alerts every second in the test
  process.argv.push("--terminal");
  await import("./src/index.ts");
  await new Promise((r) => setTimeout(r, 4000));

  console.log(JSON.stringify({ sent, reactions }, null, 1));
  const one = texts("+15550001");
  const two = texts("+15550002");

  expect(one[0]).toContain("I'm Pricey"); // warm welcome, not a command menu
  expect(one[1]).toContain("Trader Joe's Union Square");
  expect(one[2]).toMatch(/11215|Park Slope|home/i); // location pin understood
  expect(two[0]).toContain("I'm Pricey");
  expect(two[1]).toContain("Alerts on");
  // Free pizza posted after they turned alerts on: one bundled alert arrives via the outbox.
  expect(two.find((t) => t.includes("deals right now"))).toContain("free pizza");
  expect(sent.some((s) => s.space === "chat-x")).toBe(false); // outbound echoes ignored
  // Contact card only on each person's first text; 👍 on saves.
  expect(sent.filter((s) => (s.content as { type?: string })?.type === "contact-card").length).toBe(0); // terminal mode sends none
  expect(reactions.some((r) => r.glyph === "👍")).toBe(true);
}, 20000);
