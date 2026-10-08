"use client";

import { MapPinOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * When the meetings cannot be gathered for the full screen: say so on the water color, offer to
 * try again (which fetches the page afresh), and the way back to the dashboard.
 */
export default function ReachError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Log quietly for cross-referencing server logs — never show the stack to the user.
    console.error("[app/(fullscreen)/reach/error]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="fixed inset-0 grid place-items-center overflow-auto bg-[var(--map-water)] p-4">
      <EmptyState
        as="h1"
        icon={MapPinOff}
        className="w-full max-w-lg border-solid bg-card shadow-lift"
        title="The map couldn't load"
        description="The meetings for the map could not be gathered. Try again — if it keeps happening, tell the OIA systems contact."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => retry()}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Back to the dashboard
            </Link>
          </div>
        }
      />
    </main>
  );
}
