import { geminiEnabled } from "@/lib/gemini";
import { parseReceipt } from "@/lib/receipt";
import { sessionUserId } from "@/lib/session";

// Room for the 45 second Gemini time limit on a receipt photo.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(req: Request) {
  if (!(await sessionUserId())) return Response.json({ error: "Log in to scan receipts." }, { status: 401 });
  if (!geminiEnabled()) {
    return Response.json({ error: "Receipt scanning is not set up yet (GEMINI_API_KEY missing). Type the price instead." }, { status: 503 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "Attach a photo of the receipt." }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPG, PNG, WEBP, or HEIC photo." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is over 8 MB. Try a smaller one." }, { status: 400 });

  try {
    const receipt = await parseReceipt(Buffer.from(await file.arrayBuffer()), file.type);
    if (!receipt.lines.length) return Response.json({ error: "Couldn't read any food items. Try a sharper, flatter photo." }, { status: 422 });
    return Response.json(receipt);
  } catch (e) {
    console.error("Receipt scan failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Couldn't read that receipt right now. Try again, or type the price instead." }, { status: 502 });
  }
}
