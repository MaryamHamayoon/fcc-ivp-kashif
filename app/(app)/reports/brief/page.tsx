import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BriefPage } from "@/components/reports/BriefPage";
import { requireCan, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { loadBrief } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Executive brief" };
export const dynamic = "force-dynamic";

const Query = z.object({ fy: z.coerce.number().int().min(2000).max(2100).optional() });

export default async function BriefRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, user] = await Promise.all([searchParams, requireCan("reports.read", { kind: "system" }, "/reports/brief")]);
  const parsed = Query.safeParse({ fy: Array.isArray(sp.fy) ? sp.fy[0] : sp.fy });
  if (!parsed.success) redirect("/reports/brief");

  const now = new Date();
  const db = await getDb();
  const brief = await loadBrief(db, parsed.data.fy ?? fiscalYearOf(now), toPolicyUser(user), now);
  return <BriefPage brief={brief} />;
}
