import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { LocationPicker } from "@/components/location-picker";
import { getWhere, nearText } from "@/lib/where";

export const metadata = { title: "Ask Pricey" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const where = await getWhere();
  return (
    // Laptop and up: where you are on the left, the conversation on the right.
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="lg:sticky lg:top-20">
        <h1 className="mb-2 text-[2.6rem] leading-[0.95] lg:text-[3.5rem]">Ask Pricey</h1>
        <p className="mb-4 text-muted-foreground">
          Prices {where ? nearText(where) : "across NYC"}, cheap meals, and free food, from real reports.
        </p>
        <Suspense>
          <LocationPicker where={where && { label: where.label, kind: where.kind }} />
        </Suspense>
      </div>
      <div className="min-w-0">
        <Chat />
      </div>
    </div>
  );
}
