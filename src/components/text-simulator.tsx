"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { simulateTextAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

type Bubble = { from: "me" | "pricey" | "alert"; text: string };

const TRY = ["help", "how much are eggs in brooklyn?", "eggs 3.99 at key food park slope", "free bagels at myrtle deli until 5pm", "deals in brooklyn", "alerts on brooklyn"];

// Looks and works like the iMessage line, so the texting flow can be demoed from any browser.
export function TextSimulator() {
  const [bubbles, setBubbles] = useState<Bubble[]>([{ from: "pricey", text: "Hi! I'm Pricey. Text me a price, a free food spot, or a question. Text help anytime." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBubbles((b) => [...b, { from: "me", text: t }]);
    setBusy(true);
    try {
      const { reply, alert } = await simulateTextAction(t);
      setBubbles((b) => [...b, { from: "pricey", text: reply }, ...(alert ? [{ from: "alert" as const, text: alert }] : [])]);
    } catch {
      setBubbles((b) => [...b, { from: "pricey", text: "Not delivered. Try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-[2rem] border-8 border-foreground/90 bg-card shadow-lg">
      <div className="border-b bg-muted/60 py-2 text-center">
        <p className="text-sm font-semibold">Pricey</p>
        <p className="text-[11px] text-muted-foreground">iMessage</p>
      </div>
      <div className="h-[28rem] space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {bubbles.map((b, i) => (
          <div key={i} className={cn("flex", b.from === "me" ? "justify-end" : "justify-start")}>
            <div className="max-w-[80%]">
              {b.from === "alert" && <p className="mb-0.5 ml-1 text-[10px] tracking-wide text-muted-foreground uppercase">Later, as an alert</p>}
              <p
                className={cn(
                  "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  b.from === "me" ? "rounded-br-md bg-[#0a84ff] text-white" : "rounded-bl-md bg-muted",
                  b.from === "alert" && "border border-primary/40",
                )}
              >
                {b.text}
              </p>
            </div>
          </div>
        ))}
        {busy && <p className="w-14 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm text-muted-foreground">...</p>}
        <div ref={end} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-t px-2 pt-2">
        {TRY.map((t) => (
          <button key={t} onClick={() => send(t)} className="shrink-0 rounded-full border px-2.5 py-1 text-xs hover:bg-accent">
            {t}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Text Pricey" aria-label="Text message" className="h-9 rounded-full" />
        <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={busy || !input.trim()} aria-label="Send text">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
