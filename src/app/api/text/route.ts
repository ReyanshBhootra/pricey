import { textBotAuthorized } from "@/lib/text-auth";
import { handleText } from "@/lib/texting";

export const maxDuration = 60;

// POST { from, text, spaceId?, attachments?: [{ mimeType, name?, data (base64) }] }
//   -> { reply, react, contactCard, action }
// Called by the iMessage relay in bot/. Older relays send only { from, text } and read
// { reply, action }; that still works.
export async function POST(req: Request) {
  const denied = textBotAuthorized(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from.slice(0, 100) : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId.slice(0, 200) : undefined;
  const attachments = (Array.isArray(body?.attachments) ? body.attachments : [])
    .filter((a: unknown): a is { mimeType: string; data: string; name?: string } => !!a && typeof (a as { data?: unknown }).data === "string" && typeof (a as { mimeType?: unknown }).mimeType === "string")
    .slice(0, 3)
    .map((a: { mimeType: string; data: string; name?: string }) => ({ mimeType: a.mimeType, name: a.name, data: Buffer.from(a.data, "base64") }))
    .filter((a: { data: Buffer }) => a.data.length > 0 && a.data.length <= 8 * 1024 * 1024);
  if (!from || (!text.trim() && !attachments.length)) return Response.json({ error: "Need from and text or an attachment" }, { status: 400 });
  return Response.json(await handleText(from, text, { channel: "imessage", spaceId, attachments }));
}
