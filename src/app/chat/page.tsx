import { Chat } from "@/components/chat";

export const metadata = { title: "Ask Pricey" };

export default function ChatPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Ask Pricey</h1>
      <p className="mb-4 text-sm text-muted-foreground">Prices near you, cheap meals, and free food, from real reports.</p>
      <Chat />
    </>
  );
}
