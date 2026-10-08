import { Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Intake, one click from anywhere. It stands beside the search field and is as tall as it (36px
 * from a tablet up; 32px on a phone, where the search is a 32px square too). In a bar under
 * 30rem wide — a phone, or a tablet with the rail open — the label steps aside and the button
 * becomes a square, because there the plus is unambiguous and the row is not.
 */
export function NewMeetingButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Link href="/meetings/new" className={cn(buttonVariants({ size: "sm" }), "h-8 px-3 text-[0.8125rem] shadow-soft md:h-9 md:px-3.5", iconOnly ? "w-8 justify-center px-0 md:px-0" : "@max-[30rem]/bar:w-8 @max-[30rem]/bar:justify-center @max-[30rem]/bar:px-0 md:@max-[30rem]/bar:w-9 md:@max-[30rem]/bar:px-0", className)}>
      <Plus aria-hidden />
      {/* One label either way, so the button is called the same thing whatever the width. */}
      <span className={iconOnly ? "sr-only" : "sr-only @min-[30rem]/bar:not-sr-only"}>New meeting</span>
    </Link>
  );
}
