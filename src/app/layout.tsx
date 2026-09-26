import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Nav } from "@/components/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pricey",
  description: "Real grocery prices across NYC, reported and vouched for by New Yorkers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-2xl px-4 py-6 text-xs text-muted-foreground">
          Pricey. Prices reported by New Yorkers, trusted by vouching. NYC only.{" "}
          <Link href="/text" className="underline-offset-2 hover:underline">Text Pricey</Link>
        </footer>
      </body>
    </html>
  );
}
