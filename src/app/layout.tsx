import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, Figtree } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { AccountSync } from "@/components/account-sync";
import { getUser } from "@/lib/data";
import { sessionUserId } from "@/lib/session";

// Figtree for reading. Bagel Fat One (chunky, very New York) for headlines and prices.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const bagel = Bagel_Fat_One({
  variable: "--font-bagel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Pricey",
  description: "Real grocery prices across NYC, reported and vouched for by New Yorkers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#170c1f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const account = await sessionUserId();
  const profile = account ? await getUser(account) : null;
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${bagel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Nav signedIn={Boolean(account)} />
        {profile && <AccountSync tracked={profile.tracked ?? []} favorites={profile.favorites ?? []} />}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-6">{children}</main>
        {/* Bottom padding on phones clears the floating tab bar. */}
        <footer className="mx-auto w-full max-w-2xl px-4 pt-2 pb-32 text-sm text-muted-foreground sm:pb-8">
          Prices reported by New Yorkers and trusted by vouching. NYC only.
        </footer>
      </body>
    </html>
  );
}
