import type { ReactNode } from "react";

/**
 * The page's h1 where the top bar already prints its name. Sighted readers get the name from the
 * bar; the heading outline, the skip link's landing place and a screen reader's "jump to h1" get
 * it from here, inside `main`. The wrapper it sits in must be `relative`, or the clipped box
 * (position: absolute) measures against the scrolling column and inflates the page.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="sr-only">{children}</h1>;
}
