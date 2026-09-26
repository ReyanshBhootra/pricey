import { generateTextStream, geminiEnabled } from "@/lib/gemini";
import { answerFromData, buildContext, SYSTEM_PROMPT } from "@/lib/grounding";
import { inNyc } from "@/lib/format";

type Msg = { role: "user" | "assistant"; text: string };

// Room for the Gemini time limit below plus the data read.
export const maxDuration = 30;

// Replies are streamed as plain text so words show up as Gemini writes them.
// X-Pricey-Source says whether the answer came from Gemini or straight from the data.
const reply = (body: BodyInit, source: "gemini" | "data") =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Pricey-Source": source } });

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
      const chunks = await generateTextStream(
        {
          contents: messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
          // No maxOutputTokens: thinking counts toward it and can leave an empty answer.
          config: { systemInstruction: `${SYSTEM_PROMPT}\n\nDATA:\n${ctx.text}`, temperature: 0.4 },
        },
        25000,
      );
      const encoder = new TextEncoder();
      return reply(
        new ReadableStream({
          async pull(controller) {
            try {
              const { value, done } = await chunks.next();
              if (done) controller.close();
              else controller.enqueue(encoder.encode(value));
            } catch (e) {
              // Cut off mid-answer (time limit): keep what was sent, end cleanly.
              console.error("Gemini stream stopped early:", e instanceof Error ? e.message : e);
              controller.close();
            }
          },
          cancel() {
            chunks.return(undefined);
          },
        }),
        "gemini",
      );
    } catch (e) {
      console.error("Gemini chat failed, answering from data:", e instanceof Error ? e.message : e);
    }
  }

  return reply(answerFromData(question.text, ctx), "data");
}
