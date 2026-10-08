import type { PreferenceKey } from "./schema";

/**
 * How any part of the shell asks for the Display & accessibility panel: a window event the
 * mounted panel listens for. No context, no prop drilling — the top bar, the account menu and
 * the command palette can all open it without knowing where it is rendered.
 */
export const OPEN_PREFERENCES_EVENT = "ivp:open-preferences";

/**
 * Which group to scroll to and focus when the panel opens; "appearance" is the light/dark/hybrid
 * group, which is also where the rail's tone (`rail`) is chosen, so `rail` is no group of its own.
 * Neither is `collapsed`: the rail folds from its own foot button, not from the panel.
 */
export type PreferencesSection = Exclude<PreferenceKey, "rail" | "collapsed"> | "appearance";

export type OpenPreferencesDetail = { section?: PreferencesSection };

export function openPreferences(section?: PreferencesSection): void {
  window.dispatchEvent(new CustomEvent<OpenPreferencesDetail>(OPEN_PREFERENCES_EVENT, { detail: { section } }));
}
