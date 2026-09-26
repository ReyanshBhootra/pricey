"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inNyc } from "@/lib/format";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = ["How much are eggs near me?", "What can I cook for under $10?", "Any free food right now?", "Where's the cheapest coffee?"];

// Location only if the person already allowed it; never block the chat on a prompt.
function currentSpot(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(inNyc(coords.latitude, coords.longitude) ? { lat: coords.latitude, lng: coords.longitude } : null),
      () => resolve(null),
      { timeout: 4000, maximumAge: 300000 },
    );
  });
}

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const spot = useRef<Promise<{ lat: number; lng: number } | null> | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would
  // call anything returned here as a cleanup function when you leave the page.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      spot.current ??= currentSpot();
      const where = await spot.current;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, ...(where ?? {}) }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", text: data.reply ?? data.error ?? "Something went wrong." }]);
    } catch {
      setMessages([...next, { role: "assistant", text: "I couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Fill the screen below the title so the message box sits at the bottom, like a chat app.
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      {messages.length === 0 && (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-xs">
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            Answers come from prices New Yorkers actually reported.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="sm" className="rounded-full" onClick={() => ask(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      <ul className="flex-1 space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card shadow-xs",
              )}
            >
              {m.text}
            </p>
          </li>
        ))}
        {busy && (
          <li className="flex">
            <p className="rounded-2xl rounded-bl-sm border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-xs">Checking prices...</p>
          </li>
        )}
      </ul>
      <div ref={end} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 mt-4 flex gap-2 bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask about prices near you" aria-label="Your question" className="h-11 bg-card" />
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
