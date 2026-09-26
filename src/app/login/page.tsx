import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { sessionUserId } from "@/lib/session";

export const metadata = { title: "Log in · Pricey" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/profile";
  if (await sessionUserId()) redirect(next);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Log in to Pricey</h1>
      <p className="mb-5 text-sm text-muted-foreground">Keep your reports, tracked items, and favorites in one place, on the web and over text.</p>
      <LoginForm next={next} />
    </div>
  );
}
