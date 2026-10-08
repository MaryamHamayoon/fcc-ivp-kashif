"use client";

import { useCallback, useRef, useState } from "react";

export type ChartDims = { width: number; height: number };

/**
 * Measures a container for responsive SVG charts. Attach `ref` to the element
 * that should drive the size; `width`/`height` are 0 until the first measure.
 */
export function useChartDims(): ChartDims & { ref: (el: HTMLElement | null) => void } {
  const [dims, setDims] = useState<ChartDims>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setDims((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    observer.current = ro;
  }, []);

  return { ref, ...dims };
}
