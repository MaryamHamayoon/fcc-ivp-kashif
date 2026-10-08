"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReachData } from "@/lib/domain/reach";
import { knownSelection } from "@/lib/reach/scene";
import { parseReachView, type ReachView, reachQuery } from "@/lib/reach/url";

/** How often the URL may be rewritten while the reader drags the timeline window. */
export const URL_THROTTLE_MS = 250;

/** Takes the next view, or how to make it from the latest one, so two changes in one event never lose each other. */
export type SetReachView = (next: ReachView | ((latest: ReachView) => ReachView), options?: { live?: boolean }) => void;

/**
 * The view to open on: the address bar's, less a selection the payload cannot answer. The server
 * parsed `initial` from the same address, but Back to this page restores it from the router's
 * cache, `initial` and all, while the address bar holds the view the reader left. Outside Next's
 * router, as in component tests, there is no address bar to read, and `initial` stands.
 */
function openingView(initial: ReachView, params: URLSearchParams | null, data: ReachData): ReachView {
  if (!params) return initial;
  const view = parseReachView(params);
  return { ...view, selection: knownSelection(view.selection, data) };
}

/**
 * The full screen's view, mirrored into the URL with `history.replaceState`: no navigation and no
 * trip to the server. It opens on the view in the address bar, so Back from a record returns to
 * the view as the reader left it. A live change (a drag of the timeline window) writes at most
 * every 250 ms; any other change writes at once and takes a pending write with it.
 */
export function useReachView(initial: ReachView, data: ReachData): [ReachView, SetReachView] {
  // Null outside Next's router, whatever its type says.
  const params: URLSearchParams | null = useSearchParams();
  const [view, setView] = useState(() => openingView(initial, params, data));
  const latest = useRef(view);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrite = useRef(0);

  const write = useCallback(() => {
    pending.current = null;
    lastWrite.current = Date.now();
    window.history.replaceState(null, "", `${window.location.pathname}?${reachQuery(latest.current)}`);
  }, []);

  const update = useCallback<SetReachView>(
    (next, options) => {
      const value = typeof next === "function" ? next(latest.current) : next;
      latest.current = value;
      setView(value);
      if (options?.live) {
        if (pending.current) return; // the scheduled write takes the latest view with it
        const wait = URL_THROTTLE_MS - (Date.now() - lastWrite.current);
        if (wait <= 0) write();
        else pending.current = setTimeout(write, wait);
        return;
      }
      if (pending.current) clearTimeout(pending.current);
      write();
    },
    [write],
  );

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return [view, update];
}
