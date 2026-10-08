import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono, Public_Sans } from "next/font/google";

/**
 * One family for the whole interface: Public Sans, the typeface of the U.S. Web Design
 * System — compact, plain and built for federal screens. Headings are the same face at a
 * heavier weight, tightened; there is no second display family to reconcile with it.
 */
export const fontSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

/**
 * The "easier to read" typeface offered under Display & accessibility: Atkinson Hyperlegible,
 * drawn by the Braille Institute so that similar letters (I/l/1, O/0, b/d) stay distinct at
 * every size. Its files are only fetched once a reader chooses it.
 */
export const fontLegible = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-legible",
  display: "swap",
  // Next has no metrics on file for this face, so it cannot size-adjust a fallback and warns on
  // every compile; say so up front and name the stand-ins ourselves. The face is opt-in and
  // swapped in after a reader chooses it, so there is no first-paint shift to guard against.
  adjustFontFallback: false,
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});
