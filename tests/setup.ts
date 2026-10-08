import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

// axe-core assertions (`expect(await axe(container)).toHaveNoViolations()`).
// vitest-axe still ships the Vitest 1 `namespace Vi` augmentation, so the types
// live in tests/vitest-axe.d.ts instead of its own `extend-expect` entry point.
expect.extend(axeMatchers);

// jsdom does not implement matchMedia; next-themes and reduced-motion hooks call it.
// Tests run with reduced motion so animated numbers and transitions settle immediately.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as MediaQueryList;
}

// jsdom has no scrollIntoView; cmdk calls it when a command list first mounts with a selection.
if (typeof window !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no ResizeObserver; charts and cmdk measure with it.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom has no IntersectionObserver; the map watches whether it is on screen with one.
if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}
