// Who is using the website: a logged-in account (signed session cookie) or an anonymous
// browser (random id cookie). Server only.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { phoneLast4, phoneUserId } from "./phone";

const SESSION = "pricey_session";
const ANON = "pricey_uid";
export const SIGNED_IN_FLAG = "pricey_signed_in"; // readable by the browser, holds no secret
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function key(): string {
  const k = process.env.AUTH_SECRET || process.env.TEXT_BOT_SECRET;
  if (!k) throw new Error("Set AUTH_SECRET (any long random string) to enable logins.");
  return k;
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
  const want = Buffer.from(sign(`${userId}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? userId : null;
}

// The logged-in account id, or null.
export async function sessionUserId(): Promise<string | null> {
  try {
    return readSession((await cookies()).get(SESSION)?.value);
  } catch {
    return null;
  }
}

// The id to attach to reports and posts: the account if logged in, else this browser.
export async function actingUserId(): Promise<string> {
  const account = await sessionUserId();
  if (account) return account;
  const jar = await cookies();
  let id = jar.get(ANON)?.value;
  if (!id) {
    id = `web-${randomUUID()}`;
    jar.set(ANON, id, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", path: "/" });
  }
  return id;
}

export async function anonymousId(): Promise<string | null> {
  return (await cookies()).get(ANON)?.value ?? null;
}

export async function startSession(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS;
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(SESSION, `${userId}.${exp}.${sign(`${userId}.${exp}`)}`, { maxAge: THIRTY_DAYS, httpOnly: true, sameSite: "lax", secure, path: "/" });
  jar.set(SIGNED_IN_FLAG, "1", { maxAge: THIRTY_DAYS, sameSite: "lax", secure, path: "/" });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(SIGNED_IN_FLAG);
}

// Checks a Firebase Phone Auth ID token (signed by Google) and returns the verified phone.
// No service account needed: we check Google's signature, the project, and expiry ourselves.
const JWKS_URL = process.env.FIREBASE_JWKS_URL || "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyPhoneToken(idToken: string): Promise<{ phone: string; userId: string; last4: string }> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase is not configured");
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jwtVerify(idToken, jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
  const phone = typeof payload.phone_number === "string" ? payload.phone_number : "";
  if (!phone) throw new Error("This login has no phone number");
  return { phone, userId: phoneUserId(phone), last4: phoneLast4(phone) };
}
