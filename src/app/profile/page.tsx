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

export default async function ProfilePage() {
  const id = await sessionUserId();
  if (!id) redirect("/login?next=/profile");
  const [user, reports, trust, { itemById, storeById, pricesFor }] = await Promise.all([getUser(id), getReportsForUser(id), getTrustStats(id), cityIndex()]);
  const prices = reports.filter((r) => r.type === "price");
  const stores = new Set(prices.map((r) => r.storeId));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{user?.firstName ? `Hey, ${user.firstName}` : "Your profile"}</h1>
          <p className="text-sm text-muted-foreground">Phone ending in {user?.phoneLast4 ?? "····"}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          [prices.length, prices.length === 1 ? "price reported" : "prices reported"],
          [stores.size, stores.size === 1 ? "store" : "stores"],
          [reports.filter((r) => r.type === "event").length, "deals shared"],
        ].map(([n, label]) => (
          <Card key={String(label)} className="gap-0 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      <Card className="gap-1 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <BadgeCheck className="size-5 text-primary" /> Trust score
        </p>
        {trust && trust.checked >= 3 ? (
          <p className="text-sm text-muted-foreground">
            {Math.round((trust.agreed / trust.checked) * 100)}% of your prices match what other shoppers see ({trust.checked} checked), so your reports count{" "}
            <strong className="text-foreground">{trust.weight.toFixed(1)}×</strong> when Pricey picks the trusted price.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Builds as others confirm your prices. After 3 matches, accurate reporters&apos; votes count more (up to 1.5×).</p>
        )}
      </Card>

      <Card className="gap-3 p-4">
        <p className="font-semibold">Your details</p>
        <ProfileForm initial={{ firstName: user?.firstName, lastName: user?.lastName, email: user?.email, zip: /^\d{5}$/.test(user?.home?.label ?? "") ? user?.home?.label : "" }} />
      </Card>

      <Card className="gap-2 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Tag className="size-4" /> Tracking
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
          <Heart className="size-4" /> Favorite stores
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
