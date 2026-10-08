"use client";

import { useCallback, useRef, useState } from "react";

/**
 * True once the element has come into view, and for good: an entrance below the fold should
 * play when the reader gets there, not while they are still looking at the top of the page.
 * Where the browser cannot say (no IntersectionObserver), the element counts as seen at once.
 */
export function useSeen(amount = 0.35): { ref: (el: Element | null) => void; seen: boolean } {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (el: Element | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      if (typeof IntersectionObserver === "undefined") {
        setSeen(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          setSeen(true);
          io.disconnect();
        },
        { threshold: amount },
      );
      io.observe(el);
      observer.current = io;
    },
    [amount],
  );

  return { ref, seen };
}
