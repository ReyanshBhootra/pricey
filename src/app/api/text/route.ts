import { textBotAuthorized } from "@/lib/text-auth";
import { handleText } from "@/lib/texting";

export const maxDuration = 30;

// POST { from, text } -> { reply, action }. Called by the iMessage relay in bot/.
export async function POST(req: Request) {
  const denied = textBotAuthorized(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from.slice(0, 100) : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!from || !text.trim()) return Response.json({ error: "Need from and text" }, { status: 400 });
  return Response.json(await handleText(from, text));
}
