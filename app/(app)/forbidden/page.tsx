import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="eyebrow text-center">No access</p>
      <EmptyState
        as="h1"
        className="mt-4"
        icon={ShieldAlert}
        title="Your role can't open that"
        description="The page you asked for needs a permission your account doesn't have. If you think it should, ask the program coordinator."
        action={
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to the dashboard
          </Link>
        }
      />
    </div>
  );
}
