// Server only. Never import from a client component: the key must stay on the server.
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

// Models to try, in order. Each runs on its own capacity and free-tier quota, so when one is
// overloaded, rate limited, or gone, the next one usually still answers. GEMINI_MODEL, if set,
// is tried first. Chat leads with fast lite models; receipts lead with the stronger model.
export const CHAT_MODELS = unique([process.env.GEMINI_MODEL, "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"]);
export const RECEIPT_MODELS = unique([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"]);

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
type Opts = { models?: string[]; budgets?: number[]; startMs?: number };

// Per server instance: the thinking setting each model accepted, and models resting after
// being overloaded, rate limited, slow, or missing, so later questions skip them for a while.
const acceptedBudget = new Map<string, number | null>();
const restingUntil = new Map<string, number>();

class SlowStart extends Error {}

function classify(e: unknown, budget: number | null) {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number }).status;
  if (e instanceof SlowStart) return { kind: "slow" as const, msg, restMs: 60_000 };
  if ((e as { name?: string }).name === "AbortError" || /aborted|timed? ?out/i.test(msg)) return { kind: "timeout" as const, msg, restMs: 0 };
  if (status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand|quota/i.test(msg)) {
    const retryIn = Number(msg.match(/retry in ([\d.]+)s/i)?.[1] ?? 30);
    return { kind: "busy" as const, msg, restMs: Math.min(Math.max(retryIn, 5), 120) * 1000 };
  }
  if (status === 404 || /not found|is not supported for/i.test(msg)) return { kind: "missing" as const, msg, restMs: 10 * 60_000 };
  // A 400 while we sent a thinking setting almost always means the model doesn't take that
  // setting (some answer with a bare "invalid argument"). Try the same model without it.
  if (budget !== null && (status === 400 || /thinking|budget|INVALID_ARGUMENT|invalid argument/i.test(msg))) return { kind: "setting" as const, msg, restMs: 0 };
  return { kind: "other" as const, msg, restMs: 60_000 };
}

// Tries models in order and, for each, thinking settings in order (ending with none). Each
// attempt must start answering within startMs or we move on. One overall time limit.
async function attempt<T>(
  models: string[],
  budgets: number[],
  timeoutMs: number,
  startMs: number,
  req: Req,
  run: (p: GenerateContentParameters, started: () => void) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  const left = () => timeoutMs - (Date.now() - t0);
  const awake = models.filter((m) => (restingUntil.get(m) ?? 0) < Date.now());
  const order = awake.length ? awake : models; // everything resting: try anyway rather than give up
  let lastError: unknown = new Error("No Gemini model available");

  for (const model of order) {
    const all: (number | null)[] = [...budgets, null];
    const known = acceptedBudget.get(model);
    const tries = known !== undefined && all.includes(known) ? all.slice(all.indexOf(known)) : all;
    for (const budget of tries) {
      if (left() < 1500) throw lastError;
      const a0 = Date.now();
      // Abort if the model hasn't started answering in time; once it has, only the overall limit applies.
      const slow = new AbortController();
      const timer = setTimeout(() => slow.abort(new SlowStart(`no answer within ${startMs} ms`)), Math.min(startMs, left()));
      try {
        const out = await run(
          {
            ...req,
            model,
            config: {
              ...req.config,
              ...(budget !== null ? { thinkingConfig: { thinkingBudget: budget } } : {}),
              abortSignal: AbortSignal.any([AbortSignal.timeout(left()), slow.signal]),
            },
          },
          () => clearTimeout(timer),
        );
        clearTimeout(timer);
        acceptedBudget.set(model, budget);
        restingUntil.delete(model);
        console.log(`Gemini ${model} ok, first words in ${Date.now() - a0} ms (thinking ${budget ?? "default"})`);
        return out;
      } catch (err) {
        clearTimeout(timer);
        const e = slow.signal.aborted ? slow.signal.reason : err;
        lastError = e;
        const why = classify(e, budget);
        console.warn(`Gemini ${model} ${why.kind} after ${Date.now() - a0} ms (thinking ${budget ?? "default"}): ${why.msg.slice(0, 200)}`);
        if (why.kind === "timeout") throw e;
        if (why.kind === "setting") continue; // same model, next thinking setting
        restingUntil.set(model, Date.now() + why.restMs);
        break; // next model
      }
    }
  }
  throw lastError;
}

// One-shot answer (receipts, texting). Small thinking budget by default.
export function generate(req: Req, timeoutMs: number, opts: Opts = {}): Promise<GenerateContentResponse> {
  return attempt(opts.models ?? RECEIPT_MODELS, opts.budgets ?? [512], timeoutMs, opts.startMs ?? 30_000, req, (p) =>
    gemini().models.generateContent(p),
  );
}

// Streams text as Gemini writes it (chat). Resolves once the first words arrive, so a failure
// before that can still move to another model or fall back, then yields the rest.
export function generateTextStream(req: Req, timeoutMs: number, opts: Opts = {}): Promise<AsyncGenerator<string>> {
  return attempt(opts.models ?? CHAT_MODELS, opts.budgets ?? [0], timeoutMs, opts.startMs ?? 9_000, req, async (p, started) => {
    const stream = await gemini().models.generateContentStream(p);
    let first: IteratorResult<GenerateContentResponse>;
    do first = await stream.next();
    while (!first.done && !first.value.text);
    if (first.done) throw new Error("Gemini returned no text");
    started();
    const firstText = first.value.text!;
    return (async function* () {
      yield firstText;
      for await (const chunk of stream) if (chunk.text) yield chunk.text;
    })();
  });
}
