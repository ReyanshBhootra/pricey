import { TextSimulator } from "@/components/text-simulator";

export const metadata = { title: "Text Pricey" };

export default function TextPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Text Pricey</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        No app needed: report prices, share free food, ask questions, and get deal alerts over iMessage. Try it here, it works the same as the real line.
      </p>
      <TextSimulator />
    </>
  );
}
