import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { LocationPicker } from "@/components/location-picker";
import { getWhere, nearText } from "@/lib/where";

export const metadata = { title: "Ask Pricey" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const where = await getWhere();
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Ask Pricey</h1>
      <p className="mb-3 text-sm text-muted-foreground">
        Prices {where ? nearText(where) : "across NYC"}, cheap meals, and free food, from real reports.
      </p>
      <Suspense>
        <LocationPicker where={where && { label: where.label, kind: where.kind }} />
      </Suspense>
      <Chat />
    </>
  );
}
