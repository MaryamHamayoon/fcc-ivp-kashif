import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { CommandPalette } from "@/components/shell/CommandPalette";
import type { NavCounts } from "@/components/shell/nav";
import { SideRail } from "@/components/shell/SideRail";
import { SkipLink } from "@/components/shell/SkipLink";
import { TopBar } from "@/components/shell/TopBar";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import type { Db } from "@/lib/db/factory";
import { getDb } from "@/lib/db/client";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { computeAttention } from "@/lib/domain/attention";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { can, type PolicyUser, readableScope } from "@/lib/domain/policy";
import { navCounts } from "@/lib/services/nav-counts";

export const dynamic = "force-dynamic";

/** Items on the attention list for the Dashboard row's count pill; experts see only their own briefings, so the program-wide count is not theirs to carry. */
async function attentionCountFor(db: Db, user: PolicyUser, now: Date): Promise<number> {
  if (!("all" in readableScope(user))) return 0;
  return computeAttention(await makeMeetingsRepo(db).forAttention(now), now).length;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const policyUser = toPolicyUser(user);
  const canCreate = can(policyUser, "meeting.create", { kind: "system" });

  const now = new Date();
  const db = await getDb();
  const [attention, meetings] = await Promise.all([attentionCountFor(db, policyUser, now), navCounts(db, policyUser, now)]);
  const counts: NavCounts = { attention, ...meetings };

  return (
    <AppProviders>
      <SkipLink />
      <CommandPalette canReadReports={can(policyUser, "reports.read", { kind: "system" })} currentFy={fiscalYearOf(now)} />
      <div className="flex min-h-screen">
        <SideRail user={user} counts={counts} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The bar and the page share one column, so the card's edges line up with everything
              under it; only the bar is sticky, and it brings its own strip of page colour. */}
          <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col px-4 md:px-10 xl:px-12">
            <TopBar user={user} canCreate={canCreate} counts={counts} />
            {/* The bar brings 0.75rem of page colour under it; 0.25rem more makes the gap to the page's
                first card the same 1rem the cards keep between themselves. */}
            <main id="main" tabIndex={-1} className="flex-1 pb-8 pt-1 outline-none md:pb-10 xl:pb-12">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AppProviders>
  );
}
