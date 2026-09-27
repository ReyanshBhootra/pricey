import { Bell, Heart, MessageCircle, Tag } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { sessionUserId } from "@/lib/session";

export const metadata = { title: "Log in · Pricey" };

const PERKS = [
  [Tag, "Report prices and share deals"],
  [Bell, "Get alerts when tracked items change price"],
  [Heart, "Keep your favorite stores"],
  [MessageCircle, "Same account when you text Pricey"],
] as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/profile";
  if (await sessionUserId()) redirect(next);
  return (
    // Laptop and up: what an account keeps on the left, the form on the right.
    <div className="mx-auto max-w-sm lg:grid lg:max-w-none lg:grid-cols-2 lg:items-center lg:gap-12">
      <div className="lg:rounded-[1.75rem] lg:bg-hero lg:p-10 lg:text-hero-foreground">
        <h1 className="mb-2 text-[2.6rem] leading-[0.95] lg:text-[3.5rem]">Log in to Pricey</h1>
        <p className="mb-5 text-muted-foreground lg:mb-8 lg:text-lg lg:text-hero-muted">Keep your reports, tracked items, and favorites in one place, on the web and over text.</p>
        <ul className="hidden flex-col gap-4 lg:flex">
          {PERKS.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground">
                <Icon className="size-5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="lg:mx-auto lg:w-full lg:max-w-md">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
