import { addAlias, getUser, saveUser } from "@/lib/data";
import { anonymousId, endSession, startSession, verifyPhoneToken } from "@/lib/session";

// POST { idToken, tracked?, favorites? }: log in with a verified Firebase phone login.
// The account id is the same one iMessage uses for that phone, so texts and web are one person.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.idToken !== "string") return Response.json({ error: "Missing login token" }, { status: 400 });
  let who;
  try {
    who = await verifyPhoneToken(body.idToken);
  } catch (e) {
    console.error("Login token rejected:", e instanceof Error ? e.message : e);
    return Response.json({ error: "That login didn't check out. Please try again." }, { status: 401 });
  }

  const existing = await getUser(who.userId);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : []);
  // Bring along what this browser tracked and starred before logging in.
  await saveUser(who.userId, {
    phoneLast4: who.last4,
    tracked: [...new Set([...(existing?.tracked ?? []), ...list(body.tracked)])],
    favorites: [...new Set([...(existing?.favorites ?? []), ...list(body.favorites)])],
  });
  // And the prices and posts this browser made anonymously.
  const anon = await anonymousId();
  if (anon) await addAlias(anon, who.userId);
  await startSession(who.userId);
  return Response.json({ ok: true, needsProfile: !existing?.firstName, firstName: existing?.firstName ?? null });
}

export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
