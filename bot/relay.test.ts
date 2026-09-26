// Runs the real relay (src/index.ts) against a running Pricey app, with Photon faked out:
// scripted inbound iMessages go in, and we check what the relay sends back.
//   PRICEY_URL=http://localhost:3000 TEXT_BOT_SECRET=... bun test
import { expect, mock, test } from "bun:test";

const sent: { space: string; text: string }[] = [];
const space = (id: string) => ({ id, send: async (text: string) => void sent.push({ space: id, text }) });
const inbound = (from: string, text: string) => [space(`chat-${from}`), { direction: "inbound", sender: { id: from }, content: { type: "text", text } }];
const script = [
  inbound("+15550001", "help"),
  inbound("+15550001", "eggs 3.49 at trader joes union sq"),
  inbound("+15550002", "alerts on brooklyn"),
  [space("chat-x"), { direction: "outbound", sender: { id: "me" }, content: { type: "text", text: "ignored echo" } }],
  inbound("+15550001", "free pizza at myrtle deli until 3pm"),
];

const fakeApp = {
  messages: (async function* () {
    for (const m of script) {
      yield m;
      await new Promise((r) => setTimeout(r, 50));
    }
  })(),
  send: async () => undefined,
  responding: async (_s: unknown, fn: () => unknown) => await fn(),
};
mock.module("spectrum-ts", () => ({ Spectrum: async () => fakeApp }));
mock.module("spectrum-ts/providers/imessage", () => ({ imessage: { config: () => ({}) } }));
mock.module("spectrum-ts/providers/terminal", () => ({ terminal: { config: () => ({}) } }));

test("relay answers texts and sends bundled alerts", async () => {
  process.env.DIGEST_MINUTES = "0.02"; // check alerts every ~1s for the test
  process.argv.push("--terminal");
  await import("./src/index.ts");
  await new Promise((r) => setTimeout(r, 3000));

  const to1 = sent.filter((s) => s.space === "chat-+15550001").map((s) => s.text);
  const to2 = sent.filter((s) => s.space === "chat-+15550002").map((s) => s.text);
  console.log(JSON.stringify(sent, null, 1));

  expect(to1[0]).toContain("Pricey: real NYC food prices");
  expect(to1[1]).toContain("Trader Joe's Union Square");
  expect(to1[2]).toContain('"free pizza until 3pm"');
  expect(to2[0]).toContain("Alerts on!");
  // The free pizza was posted after they subscribed, so they get one bundled alert.
  expect(to2.find((t) => t.includes("discounts right now"))).toContain("free pizza until 3pm");
  expect(sent.some((s) => s.space === "chat-x")).toBe(false); // outbound echoes ignored
}, 15000);
