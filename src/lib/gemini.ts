// Server only. Never import from a client component: the key must stay on the server.
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

// Models to try, in order. Each has its own free-tier quota, so when one is rate limited or
// unavailable the next one usually still answers. GEMINI_MODEL, if set, is tried first.
// Chat: price lookups need speed more than depth, so the fast lite model leads.
// Receipts: reading a photo benefits from the stronger model.
export const CHAT_MODELS = unique([process.env.GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-flash-latest"]);
export const RECEIPT_MODELS = unique([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"]);

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

// Per server instance: the thinking budget each model accepted, and models resting after a
// rate limit or "not found", so we don't spend a request on them for every question.
const acceptedBudget = new Map<string, number | null>();
const restingUntil = new Map<string, number>();

function classify(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number }).status;
  if ((e as { name?: string }).name === "AbortError" || /aborted|timed? ?out/i.test(msg)) return { kind: "timeout" as const, msg };
  if (status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|quota/i.test(msg)) {
    const retryIn = Number(msg.match(/retry in ([\d.]+)s/i)?.[1] ?? 30);
    return { kind: "busy" as const, msg, restMs: Math.min(Math.max(retryIn, 5), 120) * 1000 };
  }
  if (status === 404 || /not found|is not supported for/i.test(msg)) return { kind: "missing" as const, msg };
  if (/thinking|budget/i.test(msg)) return { kind: "budget" as const, msg };
  return { kind: "other" as const, msg };
}

// Tries models in order and, for each, thinking budgets in order (ending with none, since a
// model may refuse a budget). Rate limited or missing models are skipped and rested.
// Everything shares one hard time limit. Throws if nothing answered.
async function attempt<T>(models: string[], budgets: number[], timeoutMs: number, req: Req, run: (p: GenerateContentParameters) => Promise<T>): Promise<T> {
  const started = Date.now();
  const left = () => timeoutMs - (Date.now() - started);
  const awake = models.filter((m) => (restingUntil.get(m) ?? 0) < Date.now());
  const order = awake.length ? awake : models; // all resting: try anyway rather than give up
  let lastError: unknown = new Error("No Gemini model available");

  for (const model of order) {
    const all: (number | null)[] = [...budgets, null];
    const known = acceptedBudget.get(model);
    const tries = known !== undefined && all.includes(known) ? all.slice(all.indexOf(known)) : all;
    for (const budget of tries) {
      if (left() < 1500) throw lastError;
      const t0 = Date.now();
      try {
        const out = await run({
          ...req,
          model,
          config: {
            ...req.config,
            ...(budget !== null ? { thinkingConfig: { thinkingBudget: budget } } : {}),
            abortSignal: AbortSignal.timeout(left()),
          },
        });
        acceptedBudget.set(model, budget);
        restingUntil.delete(model);
        console.log(`Gemini ${model} ok in ${Date.now() - t0} ms (thinking ${budget ?? "default"})`);
        return out;
      } catch (e) {
        lastError = e;
        const why = classify(e);
        console.warn(`Gemini ${model} ${why.kind} after ${Date.now() - t0} ms (thinking ${budget ?? "default"}): ${why.msg.slice(0, 200)}`);
        if (why.kind === "timeout") throw e;
        if (why.kind === "budget") continue; // same model, next budget
        if (why.kind === "busy") restingUntil.set(model, Date.now() + why.restMs);
        if (why.kind === "missing") restingUntil.set(model, Date.now() + 10 * 60 * 1000);
        break; // next model
      }
    }
  }
  throw lastError;
}

// One-shot answer (receipts, texting). Small thinking budget by default.
export function generate(req: Req, timeoutMs: number, opts: { models?: string[]; budgets?: number[] } = {}): Promise<GenerateContentResponse> {
  return attempt(opts.models ?? RECEIPT_MODELS, opts.budgets ?? [512], timeoutMs, req, (p) => gemini().models.generateContent(p));
}

// Streams text as Gemini writes it (chat). Resolves once the first text arrives, so a failure
// before that can still fall back, then yields the rest. The time limit covers the whole answer.
export function generateTextStream(req: Req, timeoutMs: number, opts: { models?: string[]; budgets?: number[] } = {}): Promise<AsyncGenerator<string>> {
  return attempt(opts.models ?? CHAT_MODELS, opts.budgets ?? [0, 512], timeoutMs, req, async (p) => {
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
