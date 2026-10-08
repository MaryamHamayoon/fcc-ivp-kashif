"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentProps, type MouseEvent, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** Dispatched on `window`; the command palette (when mounted) calls `preventDefault()` to claim it. */
export const OPEN_SEARCH_EVENT = "ivp:open-search";

export function openSearch(router: { push: (href: string) => void }) {
  const event = new CustomEvent(OPEN_SEARCH_EVENT, { cancelable: true });
  const claimed = !window.dispatchEvent(event);
  if (!claimed) router.push("/search");
}

const noopSubscribe = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** Apple keyboards say ⌘, everything else says Ctrl. Assumed Apple until hydration, so the hint never grows wider after paint. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(noopSubscribe, isApplePlatform, () => true);
}

type SearchButtonProps = Omit<ComponentProps<"button">, "type" | "children"> & {
  /** `field` reads as a search input — the top bar's left-hand side. `icon` is a bare square, for a phone. */
  variant?: "field" | "icon";
  /** What the field says before anything is typed; the icon variant has no room for it. */
  placeholder?: string;
};

/**
 * Opens the command palette. It is a button rather than an input on purpose: the palette owns
 * the caret, so a real field here would take focus twice and lose the first keystroke. It is
 * dressed as a field because that is what it behaves like from the reader's side.
 */
export function SearchButton({ variant = "field", placeholder = "Search meetings, people, countries", className, onClick, ...rest }: SearchButtonProps) {
  const router = useRouter();
  const mac = useApplePlatform();
  const icon = variant === "icon";
  return (
    <button
      type="button"
      aria-label="Search"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      {...rest}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) openSearch(router);
      }}
      className={cn(
        "inline-flex items-center rounded-md text-muted-foreground outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        icon ? "size-8 shrink-0 justify-center hover:bg-muted hover:text-foreground" : "h-9 gap-2 border border-input bg-background px-2.5 text-[0.8125rem] hover:border-brand/40 hover:text-foreground",
        className,
      )}
    >
      <Search className={icon ? "size-[18px]" : "size-4 shrink-0"} strokeWidth={1.75} aria-hidden />
      {icon ? null : (
        <>
          {/* In a short bar the field says only what it is; the long prompt comes back with the room. */}
          <span aria-hidden className="truncate @min-[64rem]/bar:hidden">
            Search
          </span>
          <span className="hidden truncate @min-[64rem]/bar:inline">{placeholder}</span>
          <kbd aria-hidden className="ml-auto shrink-0 rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-[0.625rem] leading-[1.4] text-muted-foreground">
            {mac ? "⌘K" : "Ctrl K"}
          </kbd>
        </>
      )}
    </button>
  );
}
