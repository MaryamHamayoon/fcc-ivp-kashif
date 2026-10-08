"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { type ComponentProps, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribeNoop = () => () => {};

/** True after hydration; false during SSR — avoids a mismatched icon/label on first paint. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * Light and dark, one click apart. It reads `resolvedTheme` rather than `theme`, because
 * "system" is a real choice here (the display panel offers it) and the button has to describe
 * what the reader is actually looking at.
 */
export function ThemeToggle({ className, ...rest }: ComponentProps<typeof Button>) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      {...rest}
      variant="ghost"
      size="icon"
      className={className}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
