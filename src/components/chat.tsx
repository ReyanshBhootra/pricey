"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; fromData?: boolean };

const SUGGESTIONS = ["How much are eggs near me?", "What can I cook for under $10?", "Any free food right now?", "Where's the cheapest coffee?"];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }), // the server knows where they are (saved location)
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessages([...next, { role: "assistant", text: data.error ?? "Something went wrong. Try asking again." }]);
        return;
      }
      // Show the answer word by word as it streams in.
      const fromData = res.headers.get("X-Pricey-Source") === "data";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", text, fromData }]);
      }
      text += decoder.decode();
      setMessages([...next, { role: "assistant", text: text.trim() || "Something went wrong. Try asking again.", fromData }]);
    } catch (e) {
      const slow = e instanceof DOMException && e.name === "TimeoutError";
      setMessages([...next, { role: "assistant", text: slow ? "That took too long. Try asking again." : "I couldn't reach the server. Check your connection and try again." }]);
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
              {m.text.replace(/\*\*/g, "")}
              {m.fromData && <span className="mt-2 block text-xs text-muted-foreground">Answered from price data</span>}
            </p>
          </li>
        ))}
        {busy && messages.at(-1)?.role === "user" && (
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
