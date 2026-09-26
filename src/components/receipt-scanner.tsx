"use client";

import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitReceiptAction, type ReceiptSubmitState } from "@/lib/actions";
import { money } from "@/lib/format";
import type { ParsedReceipt } from "@/lib/receipt";
import { BOROUGHS, type Item, type Store } from "@/lib/types";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Line = ParsedReceipt["lines"][number] & { keep: boolean; priceText: string };

// Phones send big photos. Shrink to 1600px JPEG before upload: faster and plenty for OCR.
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file; // e.g. HEIC on browsers that can't decode it: send as is
  }
}

export function ReceiptScanner({ items, stores }: { items: Item[]; stores: Store[] }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [borough, setBorough] = useState("");
  const [result, setResult] = useState<ReceiptSubmitState | null>(null);
  const [saving, startSaving] = useTransition();
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setLines(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setScanning(true);
    try {
      const blob = await shrink(file);
      const form = new FormData();
      form.append("photo", blob, blob === file ? file.name : "receipt.jpg");
      const res = await fetch("/api/receipt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed.");
      const parsed = data as ParsedReceipt;
      setLines(parsed.lines.map((l) => ({ ...l, keep: true, priceText: l.price.toFixed(2) })));
      setStoreId(parsed.storeId ?? (parsed.storeName ? "__new" : ""));
      setStoreName(parsed.storeName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls!.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = () =>
    startSaving(async () => {
      const chosen = lines!.filter((l) => l.keep).map((l) => ({ itemId: l.itemId, name: l.name, category: l.category, price: Number(l.priceText) }));
      const r = await submitReceiptAction(
        storeId === "__new" ? { storeId: null, newStoreName: storeName, newStoreBorough: borough } : { storeId: storeId || null },
        chosen,
      );
      setResult(r);
    });

  if (result?.ok) {
    return (
      <div className="rounded-xl border bg-brand-soft p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 size-8 text-primary" />
        <p className="font-semibold">Saved {result.saved} prices. Thank you!</p>
        {result.changed > 0 && <p className="text-sm">{result.changed} of them changed a trusted price.</p>}
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href={storeId && storeId !== "__new" ? `/store/${storeId}` : "/"}>See prices</Link>
          </Button>
          <Button onClick={() => (setLines(null), setPreview(null), setResult(null))}>Scan another</Button>
        </div>
      </div>
    );
  }

  const kept = lines?.filter((l) => l.keep).length ?? 0;

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-6 text-center shadow-xs hover:bg-accent">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your receipt" className="max-h-64 rounded-md object-contain" />
        ) : (
          <Camera className="size-8 text-primary" />
        )}
        <span className="font-medium">{preview ? "Use a different photo" : "Take or upload a receipt photo"}</span>
        <span className="text-xs text-muted-foreground">Flat, well lit, whole receipt in frame.</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => scan(e.target.files?.[0])} />
      </label>

      {scanning && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading your receipt with Gemini...
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {lines && (
        <div className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Store</p>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={selectClass} aria-label="Store">
              <option value="">Pick the store</option>
              <option value="__new">+ New store{storeName ? `: ${storeName}` : ""}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.borough})</option>
              ))}
            </select>
            {storeId === "__new" && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name" aria-label="New store name" />
                <select value={borough} onChange={(e) => setBorough(e.target.value)} className={`${selectClass} w-auto`} aria-label="Borough">
                  <option value="">Borough</option>
                  {BOROUGHS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Check the items, then save</p>
            <ul className="divide-y">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={l.keep} onChange={(e) => update(i, { keep: e.target.checked })} className="size-4 accent-[var(--primary)]" aria-label={`Include ${l.name}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.itemId ? itemName.get(l.itemId) : l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.raw}
                      {!l.itemId && <span className="ml-1 rounded bg-muted px-1">new item</span>}
                    </p>
                  </div>
                  <div className="relative w-24 shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input value={l.priceText} onChange={(e) => update(i, { priceText: e.target.value })} inputMode="decimal" className="h-9 pl-6 text-right tabular-nums" aria-label={`Price for ${l.name}`} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
          <Button size="lg" className="w-full" disabled={saving || !kept || !storeId} onClick={save}>
            {saving ? "Saving..." : `Save ${kept} ${kept === 1 ? "price" : "prices"}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Total checked: {money(lines.filter((l) => l.keep).reduce((s, l) => s + (Number(l.priceText) || 0), 0))}
          </p>
        </div>
      )}
    </div>
  );
}
