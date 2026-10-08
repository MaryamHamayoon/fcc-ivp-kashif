import type { ComponentType, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";

type FlagComponent = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
const FLAGS = Flags as unknown as Record<string, FlagComponent | undefined>;

/**
 * A country flag rendered as a decorative image. Flags are never the only
 * carrier of meaning: always place the country name (or an aria-label on the
 * parent) next to it. `size` is the flag's height in pixels (3:2 aspect).
 */
export function Flag({ code, size = 16, className }: { code: string; size?: number; className?: string }) {
  const Comp = FLAGS[code.toUpperCase()];
  const style = { width: Math.round(size * 1.5), height: size };
  if (!Comp) {
    return (
      <span aria-hidden style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-[2px] bg-muted text-[0.5rem] font-semibold uppercase text-muted-foreground ring-1 ring-black/10", className)}>
        {code.slice(0, 2)}
      </span>
    );
  }
  return (
    <span aria-hidden style={style} className={cn("inline-block shrink-0 overflow-hidden rounded-[2px] align-middle ring-1 ring-black/10 dark:ring-white/15", className)}>
      <Comp style={{ display: "block", width: "100%", height: "100%" }} />
    </span>
  );
}
