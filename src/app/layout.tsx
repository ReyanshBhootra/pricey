import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { AccountSync } from "@/components/account-sync";
import { getUser } from "@/lib/data";
import { sessionUserId } from "@/lib/session";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const account = await sessionUserId();
  const profile = account ? await getUser(account) : null;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Nav signedIn={Boolean(account)} />
        {profile && <AccountSync tracked={profile.tracked ?? []} favorites={profile.favorites ?? []} />}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-2xl px-4 py-6 text-xs text-muted-foreground">
          Pricey. Prices reported by New Yorkers, trusted by vouching. NYC only.
        </footer>
      </body>
    </html>
  );
}
