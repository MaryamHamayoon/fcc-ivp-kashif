"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

/** Long enough to be read, short enough that the button is ready for the next copy. */
const RESET_MS = 2000;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The clipboard where the browser offers it; the selection trick where it does not (plain http, an embedded view). */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: the selection trick below may still be allowed.
  }
  const focused = document.activeElement;
  const field = document.createElement("textarea");
  try {
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(field);
    field.select();
    // Deprecated, and still the only way to copy outside a secure context.
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

/**
 * Copies one value — an email address, a phone number — and says so twice: the icon turns to a
 * check for the eye, and a polite status line tells a screen reader. With words on it the button
 * reads "Copy", then "Copied"; as an icon alone its name stays put and the status line speaks.
 */
export function CopyButton({
  value,
  what,
  whose,
  iconOnly = false,
  className,
}: {
  value: string;
  /** The thing copied, lower case: "email address". */
  what: string;
  /** Whose it is, where a page holds many: "Tomas Lindqvist". */
  whose?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const copied = state === "copied";
  const subject = whose ? `${what} for ${whose}` : what;

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => setState((await writeClipboard(value)) ? "copied" : "failed");

  return (
    // `relative` keeps the visually hidden status line inside the button's own box.
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={iconOnly ? `Copy ${subject}` : undefined}
        title={iconOnly ? `Copy ${subject}` : undefined}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          iconOnly ? "size-7" : "h-7 px-2",
          copied && "text-foreground",
          className,
        )}
      >
        <span aria-hidden className="relative inline-flex size-3.5">
          <Copy className={cn("absolute inset-0 size-3.5 transition-[opacity,scale] duration-200", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
          <Check className={cn("absolute inset-0 size-3.5 text-ok transition-[opacity,scale] duration-200", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={2.5} />
        </span>
        {iconOnly ? null : (
          <>
            {/* Both words share one cell, so the button is as wide as the longer one and never jumps. */}
            <span className="grid text-left">
              <span aria-hidden={copied || undefined} className={cn("col-start-1 row-start-1", copied && "invisible")}>
                Copy
              </span>
              <span aria-hidden={!copied || undefined} className={cn("col-start-1 row-start-1", !copied && "invisible")}>
                Copied
              </span>
            </span>{" "}
            <span className="sr-only">{subject}</span>
          </>
        )}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `${capitalize(what)} copied` : state === "failed" ? `Could not copy. Select the ${what} and copy it by hand.` : ""}
      </span>
    </span>
  );
}
