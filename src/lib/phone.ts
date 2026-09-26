import { createHash } from "node:crypto";

// "+1 (415) 605-7073", "4156057073", "tel:+14156057073" -> "+14156057073".
// Non-phone ids (an Apple ID email) are lowercased as they are.
export function normalizePhone(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/^tel:/, "");
  if (s.includes("@")) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : s;
}

// One id per person, the same from iMessage and from the website login.
// Phone numbers are never stored, only this one-way hash.
export const phoneUserId = (raw: string) => `text-${createHash("sha256").update(normalizePhone(raw)).digest("hex").slice(0, 16)}`;

export const phoneLast4 = (raw: string) => normalizePhone(raw).replace(/\D/g, "").slice(-4);
