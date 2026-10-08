import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The workspace toolbar: one bordered box holding a scope row and a command row. Every list
 * page (meetings, documents, reports, directory) composes the same pieces — scope tabs with
 * counts, a bare search, one Filter menu, the chips in force, the count, the layout switch — so
 * a reader who has learnt one has learnt them all.
 */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="toolbar" className={cn("divide-y rounded-xl border bg-card shadow-soft", className)} {...props} />;
}

/** One line of the toolbar; wraps when the window is narrow. */
export function ToolbarRow({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="toolbar-row" className={cn("flex min-h-10 flex-wrap items-center gap-x-1.5 gap-y-1 px-1.5 py-1", className)} {...props} />;
}

/** A hairline between two groups of controls; dropped on a phone, where the row wraps anyway. */
export function ToolbarDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block", className)} />;
}
