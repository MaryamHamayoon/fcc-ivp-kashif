import type { Metadata } from "next";
import { PreferencesProvider } from "@/components/preferences/PreferencesProvider";
import { PreferencesSheet } from "@/components/preferences/PreferencesSheet";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fontLegible, fontMono, fontSans } from "@/lib/fonts";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences/boot";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "International Visitors Program · FCC", template: "%s · IVP" },
  description: "FCC Office of International Affairs — International Visitors Program platform",
  manifest: "/brand/site.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.ico" },
      { url: "/brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

/** An in-memory database is seeded when the server starts; give that boot room beyond a host's default timeout. */
export const maxDuration = 60;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontLegible.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/* Stamps the stored display preferences on <html> before the first paint; see lib/preferences/boot.ts. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
        <ThemeProvider>
          <PreferencesProvider>
            <TooltipProvider>{children}</TooltipProvider>
            {/* Mounted once for the whole app; opened from anywhere by `openPreferences()`. */}
            <PreferencesSheet />
            <Toaster richColors position="bottom-right" />
          </PreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
