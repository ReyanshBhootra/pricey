// Server only. Never import from a client component: the key must stay on the server.
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export const geminiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    // Only for local testing against a stand-in server.
    httpOptions: process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : undefined,
  });
  return client;
}

// generateContent with a hard time limit and a cap on "thinking", so answers come back fast
// and never hang. If a model rejects the thinking cap, retries once without it.
export async function generate(req: Omit<GenerateContentParameters, "model">, timeoutMs: number): Promise<GenerateContentResponse> {
  const started = Date.now();
  const call = (thinking: boolean) =>
    gemini().models.generateContent({
      ...req,
      model: GEMINI_MODEL,
      config: {
        ...req.config,
        ...(thinking ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
        abortSignal: AbortSignal.timeout(Math.max(1000, timeoutMs - (Date.now() - started))),
      },
    });
  try {
    return await call(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/thinking/i.test(msg) || Date.now() - started > timeoutMs - 2000) throw e;
    console.warn("Gemini rejected the thinking cap, retrying without it:", msg);
    return await call(false);
  } finally {
    console.log(`Gemini ${GEMINI_MODEL} took ${Date.now() - started} ms`);
  }
}
