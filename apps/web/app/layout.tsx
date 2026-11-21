import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], weight: ["300", "400"], variable: "--font-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Good Standing: stay compliant after Stripe Atlas",
  description:
    "Reads your formation documents and tells you what your Delaware company owes, when, and why, with every number sourced. Built for Stripe Atlas founders. Not affiliated with Stripe. Information, not tax or legal advice.",
};

export const viewport: Viewport = { themeColor: "#05030D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <head>
        {/* Switzer (Fontshare, free for commercial use). */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
