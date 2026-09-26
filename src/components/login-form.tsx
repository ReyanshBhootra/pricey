"use client";

import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { Phone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ProfileForm } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseApp } from "@/lib/firebase";

type Step = "phone" | "code" | "profile";

// "(646) 555-0199" -> "+16465550199"; returns null if it can't be a US number.
function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-phone-number": "That phone number doesn't look right.",
    "auth/invalid-verification-code": "That code isn't right. Check the text and try again.",
    "auth/code-expired": "That code expired. Send a new one.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/quota-exceeded": "We've hit today's texting limit. Try again later.",
    "auth/operation-not-allowed": "Phone login isn't turned on yet (Firebase, Authentication, Sign-in method, Phone).",
    "auth/unauthorized-domain": "This website isn't allowed to log in yet (Firebase, Authentication, Settings, Authorized domains).",
    "auth/billing-not-enabled": "Real SMS codes need Firebase billing. Use one of the test numbers for the demo.",
    "auth/captcha-check-failed": "The robot check failed. Reload the page and try again.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}

const readList = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
};

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const app = getFirebaseApp();

  if (!app) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Login needs Firebase to be set up for this site.</p>;

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const e164 = toE164(phone);
    if (!e164) return setError("Enter a 10-digit US phone number.");
    setBusy(true);
    try {
      const auth = getAuth(app);
      verifier.current ??= new RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, e164, verifier.current);
      setStep("code");
    } catch (err) {
      console.error(err);
      setError(friendly(err));
      verifier.current?.clear();
      verifier.current = null;
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation.current) return setStep("phone");
    setError("");
    setBusy(true);
    try {
      const cred = await confirmation.current.confirm(code.trim());
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, tracked: readList("pricey_tracked"), favorites: readList("pricey_favorites") }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error), { code: "server" });
      await getAuth(app).signOut(); // our own session cookie takes it from here
      if (data.needsProfile) setStep("profile");
      else {
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError((err as { code?: string }).code === "server" ? (err as Error).message : friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(646) 555-0199" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 pl-9" required />
            </div>
            <p className="text-xs text-muted-foreground">We text you a 6-digit code. No password. Use the same number you text Pricey from and it&apos;s one account.</p>
          </div>
          <Button disabled={busy} size="lg" className="w-full">
            {busy ? "Sending..." : "Text me a code"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={checkCode} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code sent to {phone}</Label>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="h-11 pl-9 tracking-[0.3em]" required autoFocus />
            </div>
          </div>
          <Button disabled={busy || code.length < 6} size="lg" className="w-full">
            {busy ? "Checking..." : "Log in"}
          </Button>
          <button type="button" onClick={() => (setStep("phone"), setCode(""))} className="w-full text-sm text-muted-foreground hover:text-foreground">
            Use a different number
          </button>
        </form>
      )}

      {step === "profile" && (
        <div className="space-y-4">
          <div>
            <p className="font-semibold">You&apos;re in! One quick thing.</p>
            <p className="text-sm text-muted-foreground">Pricey uses this to greet you and find prices near you, in the app and over text.</p>
          </div>
          <ProfileForm initial={{}} submitLabel="Finish" next={next} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div id="recaptcha" />
    </div>
  );
}
