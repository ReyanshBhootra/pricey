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

type Req = Omit<GenerateContentParameters, "model">;

// Tries each thinking budget in turn (a model may refuse a budget, e.g. one that must think),
// ending with no budget at all. Everything shares one hard time limit.
async function withBudgets<T>(req: Req, budgets: number[], timeoutMs: number, run: (p: GenerateContentParameters) => Promise<T>): Promise<T> {
  const started = Date.now();
  const attempts: (number | null)[] = [...budgets, null];
  try {
    for (let i = 0; ; i++) {
      const budget = attempts[i];
      try {
        return await run({
          ...req,
          model: GEMINI_MODEL,
          config: {
            ...req.config,
            ...(budget !== null ? { thinkingConfig: { thinkingBudget: budget } } : {}),
            abortSignal: AbortSignal.timeout(Math.max(1000, timeoutMs - (Date.now() - started))),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const last = i === attempts.length - 1;
        if (last || !/thinking|budget/i.test(msg) || Date.now() - started > timeoutMs - 2000) throw e;
        console.warn(`Gemini refused thinking budget ${budget}, trying ${attempts[i + 1] ?? "none"}:`, msg.slice(0, 200));
      }
    }
  } finally {
    console.log(`Gemini ${GEMINI_MODEL} responded in ${Date.now() - started} ms`);
  }
}

// One-shot answer with a hard time limit. Default: small thinking budget.
export function generate(req: Req, timeoutMs: number, budgets = [512]): Promise<GenerateContentResponse> {
  return withBudgets(req, budgets, timeoutMs, (p) => gemini().models.generateContent(p));
}

// Streams text as Gemini writes it. Resolves once the first text arrives (so a failure before
// that can still fall back), then yields the rest. The time limit covers the whole answer.
export async function generateTextStream(req: Req, timeoutMs: number, budgets = [0, 512]): Promise<AsyncGenerator<string>> {
  return withBudgets(req, budgets, timeoutMs, async (p) => {
    const stream = await gemini().models.generateContentStream(p);
    let first: IteratorResult<GenerateContentResponse>;
    do first = await stream.next();
    while (!first.done && !first.value.text);
    if (first.done) throw new Error("Gemini returned no text");
    const firstText = first.value.text!;
    return (async function* () {
      yield firstText;
      for await (const chunk of stream) if (chunk.text) yield chunk.text;
    })();
  });
}
