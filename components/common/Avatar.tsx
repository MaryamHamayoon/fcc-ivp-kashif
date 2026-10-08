import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = { xs: "size-6 text-[0.625rem]", sm: "size-7 text-[0.6875rem]", md: "size-8 text-xs", lg: "size-10 text-sm", xl: "size-14 text-lg" } as const;

/** Stable hue per name so the same person always wears the same color. */
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function UserAvatar({ name, size = "md", decorative = false, label, className }: { name: string; size?: keyof typeof SIZES; decorative?: boolean; /** Accessible name when `name` alone is not enough, e.g. "Lead: Priya Raman". */ label?: string; className?: string }) {
  const h = hue(name);
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : (label ?? name)}
      aria-hidden={decorative || undefined}
      style={{ background: `oklch(0.52 0.09 ${h})`, color: "white" }}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide ring-2 ring-background", SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}
