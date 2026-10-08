import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Global fallback for a URL that matches no route at all (outside the `(app)` shell — no side
 * rail or top bar here). Still renders inside the root layout, so theme tokens and fonts apply;
 * `app/(app)/not-found.tsx` carries the same copy for record pages inside the app shell.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16 text-foreground">
      <div className="w-full max-w-xl text-center">
        <p className="eyebrow">Not found</p>
        <EmptyState
          as="h1"
          icon={Compass}
          className="mt-4"
          title="Nothing lives at this address"
          description="This record or page doesn't exist — it may have been moved, closed out, or the link is out of date."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/" className={buttonVariants({ variant: "default" })}>
                Back to the dashboard
              </Link>
              <Link href="/meetings" className={buttonVariants({ variant: "outline" })}>
                Go to Meetings
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
