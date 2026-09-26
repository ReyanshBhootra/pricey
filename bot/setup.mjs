// One-time setup for the Pricey iMessage relay.   Run:  npm run setup
// Asks for your Photon project ID and secret, makes the shared password for Vercel,
// writes bot/.env, and installs what the relay needs. Only uses Node.
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
const lines = rl[Symbol.asyncIterator](); // buffers answers, so pasting several lines at once works
const old = existsSync(".env") ? Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};

const ask = async (question, fallback = "") => {
  const shown = fallback ? ` [${fallback.length > 12 ? fallback.slice(0, 6) + "..." : fallback}]` : "";
  stdout.write(`${question}${shown}: `);
  const { value } = await lines.next();
  if (!stdin.isTTY) stdout.write("\n");
  const answer = (value ?? "").trim();
  return answer || fallback;
};

console.log("\nPricey iMessage setup. Press Enter to keep a value in [brackets].\n");
console.log("Find these at app.photon.codes, in your Pricey project (or run: npx @photon-ai/cli projects secret).");
const projectId = await ask("1/3  Photon PROJECT_ID", old.PROJECT_ID);
const projectSecret = await ask("2/3  Photon PROJECT_SECRET (starts with spk_)", old.PROJECT_SECRET);
const priceyUrl = await ask("3/3  Your Pricey website", old.PRICEY_URL || "https://pricey-nine.vercel.app");
rl.close();

if (!projectId || !projectSecret) {
  console.error("\nNeed both the project ID and the secret. Run npm run setup again when you have them.");
  process.exit(1);
}
if (!projectSecret.startsWith("spk_")) console.warn("\nHeads up: Photon secrets usually start with spk_. Double check it if the relay fails to connect.");

const textBotSecret = old.TEXT_BOT_SECRET || randomBytes(24).toString("hex");
writeFileSync(
  ".env",
  [`PROJECT_ID=${projectId}`, `PROJECT_SECRET=${projectSecret}`, `PRICEY_URL=${priceyUrl.replace(/\/$/, "")}`, `TEXT_BOT_SECRET=${textBotSecret}`, "DIGEST_MINUTES=10", ""].join("\n"),
);
console.log("\nSaved bot/.env (it is never committed to git).");

if (!existsSync("node_modules/spectrum-ts") || !existsSync("node_modules/tsx")) {
  console.log("Installing the relay's packages (about a minute)...");
  execSync("npm install --no-audit --no-fund", { stdio: "inherit" });
}

console.log(`
Almost done. One thing in Vercel:

  Vercel -> your pricey project -> Settings -> Environment Variables -> add:
    Key:   TEXT_BOT_SECRET
    Value: ${textBotSecret}
  Save, then Deployments -> ... on the newest one -> Redeploy.

Then start the relay with:   npm start
Leave that window open while you want Pricey to answer texts.
`);
