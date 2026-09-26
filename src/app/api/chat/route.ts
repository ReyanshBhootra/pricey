import { GEMINI_MODEL, gemini, geminiEnabled } from "@/lib/gemini";
import { answerFromData, buildContext, SYSTEM_PROMPT } from "@/lib/grounding";
import { inNyc } from "@/lib/format";

type Msg = { role: "user" | "assistant"; text: string };

export async function POST(req: Request) {
  let body: { messages?: Msg[]; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
  const question = messages.at(-1);
  if (!question || question.role !== "user") return Response.json({ error: "Ask a question" }, { status: 400 });

  const where = typeof body.lat === "number" && typeof body.lng === "number" && inNyc(body.lat, body.lng) ? { lat: body.lat, lng: body.lng } : null;
  // Ground on the last few questions so follow-ups ("is that the cheapest?") keep their item.
  const recent = messages.filter((m) => m.role === "user").slice(-3).map((m) => m.text).join("\n");
  const ctx = await buildContext(recent, where);

  if (geminiEnabled()) {
    try {
      const res = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
        // No maxOutputTokens: Flash models "think" first and that counts toward the cap, so a
        // tight cap can leave an empty answer on longer questions. The prompt keeps replies short.
        config: { systemInstruction: `${SYSTEM_PROMPT}\n\nDATA:\n${ctx.text}`, temperature: 0.4 },
      });
      const reply = res.text?.replace(/\*\*/g, "").trim();
      if (reply) return Response.json({ reply, source: "gemini" });
      console.error("Gemini chat returned no text, answering from data. finishReason:", res.candidates?.[0]?.finishReason, "blockReason:", res.promptFeedback?.blockReason);
    } catch (e) {
      console.error("Gemini chat failed, answering from data:", e instanceof Error ? e.message : e);
    }
  }

  return Response.json({ reply: answerFromData(question.text, ctx), source: "data" });
}
