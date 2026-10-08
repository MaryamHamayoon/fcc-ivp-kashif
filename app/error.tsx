"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Global fallback for an uncaught rendering error outside the `(app)` shell (or one that
 * escapes it) — no side rail or top bar here. Still renders inside the root layout, so theme
 * tokens and fonts apply; `app/(app)/error.tsx` carries the same copy for errors raised inside
 * the app shell. Error boundaries must be Client Components, so this can't export `metadata`.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log quietly for cross-referencing server logs — never show the stack to the user.
    console.error("[app/error]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16 text-foreground">
      <div className="w-full max-w-xl text-center">
        <p className="eyebrow">Error</p>
        <EmptyState
          as="h1"
          icon={AlertTriangle}
          className="mt-4"
          title="Something went wrong on our side"
          description="The page hit an error. Try again — if it keeps happening, tell the OIA systems contact."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="default" onClick={() => reset()}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Back to the dashboard
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
