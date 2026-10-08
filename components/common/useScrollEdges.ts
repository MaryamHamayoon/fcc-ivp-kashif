"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Tracks whether a horizontally-scrolling element still has content hidden past its start
 * and/or end, so a caller can mask only the side that is actually clipped rather than fading
 * both edges unconditionally. Measures on mount, on scroll and on resize (via `ResizeObserver`,
 * guarded for environments — jsdom included — that lack it). False/false until the first
 * measurement, so server render and first paint carry no mask.
 */
export function useScrollEdges<T extends HTMLElement>(): { ref: RefObject<T | null>; start: boolean; end: boolean } {
  const ref = useRef<T | null>(null);
  const [start, setStart] = useState(false);
  const [end, setEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setStart(el.scrollLeft > 0);
      setEnd(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    // The element's own box does not change when its content grows (a count arriving, a longer
    // label), so the children are watched too; that is what moves scrollWidth.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }

    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  return { ref, start, end };
}
