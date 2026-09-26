import { textBotAuthorized } from "@/lib/text-auth";
import { dealsDigest, findBorough } from "@/lib/texting";

// GET ?borough=Brooklyn|all&since=<ms> -> { text } or { text: null } when nothing new.
// The relay calls this on a timer for each subscriber, so alerts arrive batched as one text.
export async function GET(req: Request) {
  const denied = textBotAuthorized(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const borough = findBorough(url.searchParams.get("borough") ?? "");
  const since = Number(url.searchParams.get("since")) || 0;
  return Response.json({ text: await dealsDigest(borough, since) });
}
