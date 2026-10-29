import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Three fonts, self-hosted by next/font (no request to Google at runtime):
// Bricolage Grotesque gives headings character, Figtree is calm and very
// readable for explanations, JetBrains Mono separates 0/O and 1/l/I in code.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Codewise: a calm workbench for code", template: "%s · Codewise" },
  description: "Explain, generate, review, fix, test and convert code with an AI assistant that never runs your code.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before first paint: no flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteHeader />
        <main id="main" className="w-full flex-1" tabIndex={-1}>
          {children}
        </main>
        <footer className="bg-footer text-footer-fg">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>Codewise reads and writes text. It never runs your code.</p>
            <p>Answers can be wrong. Read and test everything before you use it.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
