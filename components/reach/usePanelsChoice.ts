"use client";

import { browserPref } from "@/lib/browser-pref";
import { PANELS_CHOICES, type PanelsChoice } from "@/lib/reach/layout";

/** How the reader left the full screen's panels: one choice per browser. Until they choose, the width decides. */
export const PANELS_PREF = browserPref("ivp.reach.panels", PANELS_CHOICES, "auto");

export function usePanelsChoice(): [choice: PanelsChoice, setChoice: (choice: PanelsChoice) => void] {
  return [PANELS_PREF.useValue(), PANELS_PREF.set];
}
