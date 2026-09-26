import { textBotAuthorized } from "@/lib/text-auth";
import { collectOutbox } from "@/lib/outbox";

export const maxDuration = 60;

// GET -> { texts: [{ spaceId, text, kind }] }. The relay calls this every minute and sends
// each text into that iMessage conversation. Each text is handed out once.
export async function GET(req: Request) {
  const denied = textBotAuthorized(req);
  if (denied) return denied;
  return Response.json({ texts: await collectOutbox() });
}
