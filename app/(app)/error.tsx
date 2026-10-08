"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Renders inside the app shell (side rail, top bar stay) whenever a route segment under
 * `(app)` throws an uncaught rendering error. A genuinely unmatched error outside this group
 * falls through to the root `app/error.tsx` instead. Error boundaries must be Client
 * Components, so this can't export `metadata`.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log quietly for cross-referencing server logs — never show the stack to the user.
    console.error("[app/(app)/error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
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
  );
}
