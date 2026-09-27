"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Pricey's face in the chat: the lime price sticker.
function Avatar() {
  return (
    <span aria-hidden className="sticker grid size-8 shrink-0 place-items-center rounded-full bg-lime font-display text-sm text-lime-foreground">
      $
    </span>
  );
}

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
    if (messages.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
        <div className="mb-4 rounded-[1.5rem] bg-hero p-5 text-hero-foreground">
          <p className="mb-4 flex items-center gap-2.5 text-sm text-hero-muted">
            <Avatar />
            Answers come from prices New Yorkers actually reported.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full bg-white/10 px-3.5 py-2 text-left text-sm font-semibold transition-colors outline-none hover:bg-lime hover:text-lime-foreground focus-visible:ring-2 focus-visible:ring-lime active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="flex-1 space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={cn("flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && <Avatar />}
            <p
              className={cn(
                "max-w-[82%] rounded-[1.25rem] px-4 py-2.5 whitespace-pre-wrap",
                m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card",
              )}
            >
              {m.text.replace(/\*\*/g, "")}
              {m.fromData && <span className="mt-2 block text-xs text-muted-foreground">Answered from price data</span>}
            </p>
          </li>
        ))}
        {busy && messages.at(-1)?.role === "user" && (
          <li className="flex items-end gap-2 animate-in fade-in">
            <Avatar />
            <p className="flex items-center gap-1 rounded-[1.25rem] rounded-bl-md border bg-card px-4 py-3.5" role="status">
              <span className="sr-only">Checking prices</span>
              {[0, 1, 2].map((d) => (
                <span key={d} aria-hidden className="typing-dot size-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </p>
          </li>
        )}
      </ul>
      <div ref={end} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        // On phones it sits just above the floating tab bar.
        className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mt-4 flex gap-2 rounded-full bg-background/80 p-1 backdrop-blur sm:bottom-3"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask about prices near you" aria-label="Your question" className="h-12 rounded-full pl-5 shadow-sm" />
        <Button type="submit" size="icon" className="size-12 shrink-0" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
