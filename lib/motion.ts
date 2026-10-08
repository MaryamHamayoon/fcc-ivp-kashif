"use client";

import { type Transition, useReducedMotionConfig } from "motion/react";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Whether the reader prefers reduced motion — from the device, or from Display & accessibility
 * (the preferences provider feeds it through `MotionConfig`).
 *
 * It is `null` until hydration is over. The server cannot know the preference, so the client's
 * first render must not know it either: any markup that branches on it (a withdrawn pause
 * control, an element drawn already in place) would otherwise disagree with the HTML the
 * reader was sent, and React would throw the tree away and rebuild it. Treat `null` as
 * "no preference yet" and keep the markup the same; the real answer arrives one render later.
 * For how long something should take, ask `motionTransition` instead — that may know sooner.
 */
export function useReducedMotion(): boolean | null {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const preference = useReducedMotionConfig();
  return hydrated ? preference : null;
}

/**
 * Whether motion should be reduced *right now*, asked of the document itself: the device
 * setting, or the choice the boot script stamped on `<html>` before first paint. False on the
 * server. Safe to consult during render only for things that never reach the markup — a
 * transition's duration — so the client may disagree with the server without harm.
 */
export function reducedMotionNow(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.getAttribute("data-motion") === "reduced") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const INSTANT: Transition = { duration: 0 };

/**
 * `animated`, unless the reader prefers reduced motion right now — then the change simply
 * lands. Reduced motion means stopped, not slowed: an entrance still declared in the markup
 * (so the server and the client agree) completes in the same frame it starts.
 */
export function motionTransition(animated: Transition): Transition {
  return reducedMotionNow() ? INSTANT : animated;
}
