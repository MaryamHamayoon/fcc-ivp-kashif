"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { usePreferences } from "@/lib/preferences/store";

/**
 * Hands the motion preference to Motion. Everything else a preference changes is CSS keyed on
 * the `data-*` attributes the store stamps on <html>; motion is the one thing JavaScript has to
 * be told about, because Motion's components read `MotionConfig`, not the stylesheet. Every
 * component asks `useReducedMotion` from `@/lib/motion`, which reads this config.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const prefs = usePreferences();
  return <MotionConfig reducedMotion={prefs.motion === "reduced" ? "always" : "user"}>{children}</MotionConfig>;
}
