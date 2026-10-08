"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { INTERPRETER_MODES, MEETING_FORMATS, ORG_KINDS, PARTICIPANT_CATEGORIES } from "@/lib/domain/types";
import { NY_TZ } from "@/lib/domain/fiscal-year";
import { EMPTY_DRAFT, newMemberKey, type WizardDraft } from "./wizard-schema";

/** One unfinished request per browser: intake is a single-tab task, and a stale key would confuse. */
export const DRAFT_KEY = "ivp.wizard.draft";
export const DRAFT_DEBOUNCE_MS = 400;

const str = z.string().catch("");
const flag = z.boolean().catch(false);

/**
 * A stored draft is untrusted: it may come from an older build, another tab, or a
 * hand-edited value. Every field falls back to its blank state rather than throwing,
 * so a partial draft still restores what it can.
 */
const StoredDraft = z.object({
  requestor: z
    .object({
      name: str,
      title: str,
      organizationName: str,
      organizationKind: z.enum(ORG_KINDS).or(z.literal("")).catch(""),
      email: str,
      phone: str,
      viaIntermediary: str,
    })
    .catch(() => ({ ...EMPTY_DRAFT.requestor })),
  countryCodes: z.array(z.string().length(2)).catch([]),
  regionId: str,
  leadUserId: str,
  delegation: z
    .object({
      headline: str,
      purpose: str,
      size: str,
      members: z
        .array(
          z.object({
            key: z.string().catch(() => newMemberKey()),
            name: str,
            title: str,
            category: z.enum(PARTICIPANT_CATEGORIES).catch("foreign_gov"),
            isInterpreter: flag,
          }),
        )
        .catch([]),
    })
    .catch(() => ({ ...EMPTY_DRAFT.delegation })),
  topics: z.array(z.object({ topicId: z.string().min(1), detail: str })).catch([]),
  dates: z
    .object({
      preferredStart: str,
      preferredEnd: str,
      alternateStart: str,
      format: z.enum(MEETING_FORMATS).or(z.literal("")).catch(""),
      timezone: z.string().catch(NY_TZ),
    })
    .catch(() => ({ ...EMPTY_DRAFT.dates })),
  logistics: z
    .object({
      needsAv: flag,
      interpreter: z.enum(INTERPRETER_MODES).catch("none"),
      accommodations: str,
      localContact: str,
      backgroundUrl: str,
    })
    .catch(() => ({ ...EMPTY_DRAFT.logistics })),
  ochRequested: flag,
});

function readDraft(): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = StoredDraft.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // private mode, quota, or unreadable JSON — start clean rather than fail
  }
}

type DraftStore = {
  subscribe: (listener: () => void) => () => void;
  /** The draft found in storage when this wizard mounted; null once resumed or dropped. */
  restorable: () => WizardDraft | null;
  save: (draft: WizardDraft) => void;
  dismiss: () => void;
  /** Throw the stored draft away; later edits are saved again ("Start fresh"). */
  clear: () => void;
  /** Throw it away and stop saving — the request has been filed. */
  finish: () => void;
};

function createDraftStore(): DraftStore {
  let restorable = readDraft();
  let finished = false;
  const listeners = new Set<() => void>();

  const dismiss = () => {
    if (restorable === null) return;
    restorable = null;
    for (const listener of listeners) listener();
  };

  const remove = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to clean up */
    }
    dismiss();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restorable: () => restorable,
    save(draft) {
      if (finished) return;
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* private mode or quota — the wizard still works, it just won't survive a reload */
      }
    },
    dismiss,
    clear: remove,
    finish() {
      finished = true;
      remove();
    },
  };
}

/** Storage is only read after hydration, so the server and the first client render agree. */
const noStoredDraft = () => null;

export type WizardDraftController = {
  draft: WizardDraft;
  update: (patch: (current: WizardDraft) => WizardDraft) => void;
  /** Present only while an unfinished request is waiting to be resumed. */
  restorable: WizardDraft | null;
  resume: () => void;
  startFresh: () => void;
  /** Forget the draft entirely — used once the meeting has been created. */
  discard: () => void;
};

export function useWizardDraft(initial: WizardDraft = EMPTY_DRAFT): WizardDraftController {
  const [store] = useState(createDraftStore);
  const restorable = useSyncExternalStore(store.subscribe, store.restorable, noStoredDraft);
  const [draft, setDraft] = useState<WizardDraft>(initial);
  // Nothing is written until the reader actually types, so opening the page never
  // overwrites the draft they are about to be offered.
  const [dirty, setDirty] = useState(false);

  const update = useCallback((patch: (current: WizardDraft) => WizardDraft) => {
    setDraft(patch);
    setDirty(true);
  }, []);

  const resume = useCallback(() => {
    const found = store.restorable();
    if (found) setDraft(found);
    store.dismiss();
  }, [store]);

  const startFresh = useCallback(() => store.clear(), [store]);

  // The values stay on screen while the router navigates to the new record; only
  // the stored copy goes, and nothing is written again.
  const discard = useCallback(() => {
    setDirty(false);
    store.finish();
  }, [store]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => store.save(draft), DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, store]);

  return { draft, update, restorable, resume, startFresh, discard };
}
