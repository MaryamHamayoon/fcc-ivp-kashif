import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while the server renders the page and while the browser hydrates it; true from the render
 * after. A layout drawn from the window's width waits for it, so the server's guess at the width
 * never flashes on a narrower screen.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
