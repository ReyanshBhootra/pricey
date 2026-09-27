import { BadgeCheck, Heart, MessageCircle, Tag } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ProfileForm } from "@/components/profile-form";
import { Card } from "@/components/ui/card";
import { getReportsForUser, getTrustStats, getUser } from "@/lib/data";
import { cityIndex } from "@/lib/grounding";
import { money } from "@/lib/format";
import { sessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your profile · Pricey" };

// How often your prices match what others see, as a ring that fills in.
function TrustRing({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 44 44" className="size-18 shrink-0 -rotate-90" role="img" aria-label={`${pct}% of your prices match`}>
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} className="ring-fill stroke-lime" />
      <text x="22" y="22" dominantBaseline="central" textAnchor="middle" className="rotate-90 fill-foreground font-display text-[11px]" style={{ transformOrigin: "22px 22px" }}>
        {pct}%
      </text>
    </svg>
  );
}

export default async function ProfilePage() {
  const id = await sessionUserId();
  if (!id) redirect("/login?next=/profile");
  const [user, reports, trust, { itemById, storeById, pricesFor }] = await Promise.all([getUser(id), getReportsForUser(id), getTrustStats(id), cityIndex()]);
  const prices = reports.filter((r) => r.type === "price");
  const stores = new Set(prices.map((r) => r.storeId));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[2.6rem] leading-[0.95]">{user?.firstName ? `Hey, ${user.firstName}` : "Your profile"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Phone ending in {user?.phoneLast4 ?? "····"}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            [prices.length, prices.length === 1 ? "price reported" : "prices reported", "bg-lime text-lime-foreground"],
            [stores.size, stores.size === 1 ? "store" : "stores", "bg-[#8fd3ff] text-[#2a1338]"],
            [reports.filter((r) => r.type === "event").length, "deals shared", "bg-tangerine text-tangerine-foreground"],
          ] as const
        ).map(([n, label, tone]) => (
          <div key={label} className={`rounded-[1.5rem] p-3 text-center ${tone}`}>
            <p className="font-display text-4xl tabular-nums">{n}</p>
            <p className="text-xs font-semibold">{label}</p>
          </div>
        ))}
      </div>

      <Card className="flex-row items-center gap-4 p-4">
        {trust && trust.checked >= 3 && <TrustRing pct={Math.round((trust.agreed / trust.checked) * 100)} />}
        <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="size-5 text-drop" /> Trust score
        </p>
        {trust && trust.checked >= 3 ? (
          <p className="text-sm text-muted-foreground">
            {Math.round((trust.agreed / trust.checked) * 100)}% of your prices match what other shoppers see ({trust.checked} checked), so your reports count{" "}
            <strong className="text-foreground">{trust.weight.toFixed(1)}×</strong> when Pricey picks the trusted price.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Builds as others confirm your prices. After 3 matches, accurate reporters&apos; votes count more (up to 1.5×).</p>
        )}
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <p className="font-semibold">Your details</p>
        <ProfileForm initial={{ firstName: user?.firstName, lastName: user?.lastName, email: user?.email, zip: /^\d{5}$/.test(user?.home?.label ?? "") ? user?.home?.label : "" }} />
      </Card>

      <Card className="gap-2 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Tag className="size-4 text-drop" /> Tracking
        </p>
        {user?.tracked?.length ? (
          <ul className="divide-y text-sm">
            {user.tracked.map((itemId) => {
              const best = pricesFor(itemId)[0];
              return (
                <li key={itemId}>
                  <Link href={`/item/${itemId}`} className="flex justify-between py-2 hover:text-primary">
                    <span>{itemById.get(itemId)?.name ?? itemId}</span>
                    {best && <span className="text-muted-foreground">from {money(best.price)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet. Tap Track price on any item, or text Pricey &quot;track eggs&quot;.</p>
        )}
      </Card>

      <Card className="gap-2 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Heart className="size-4 text-hike" /> Favorite stores
        </p>
        {user?.favorites?.length ? (
          <ul className="divide-y text-sm">
            {user.favorites.map((sid) => (
              <li key={sid}>
                <Link href={`/store/${sid}`} className="block py-2 hover:text-primary">
                  {storeById.get(sid)?.name ?? sid}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Star stores on the map to keep them here.</p>
        )}
      </Card>

      <Card className="gap-1 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <MessageCircle className="size-4" /> Texting Pricey
        </p>
        <p className="text-sm text-muted-foreground">
          Text Pricey from the phone ending in {user?.phoneLast4 ?? "····"} and it&apos;s the same account: your home, tracked items, and reports are shared.
          {user?.alerts ? ` Deal alerts are on for ${user.alerts.area === "all" ? "all of NYC" : user.alerts.area}.` : " Text \"alerts on\" to get bundled deal alerts."}
        </p>
      </Card>
    </div>
  );
}
