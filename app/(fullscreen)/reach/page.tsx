import type { Metadata } from "next";
import { ReachScreen } from "@/components/reach/ReachScreen";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { knownSelection } from "@/lib/reach/scene";
import { parseReachView } from "@/lib/reach/url";
import { getReachData } from "@/lib/services/reach";

export const metadata: Metadata = { title: "Global reach" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** Next hands the query as a record; the parser reads the same URLSearchParams the screen writes. */
function toParams(sp: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}

/** The full-screen map: every meeting this reader may see, in one payload, opened on the view the URL describes. */
export default async function ReachPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser("/reach")]);
  const data = await getReachData(await getDb(), { user: toPolicyUser(user) });
  const view = parseReachView(toParams(sp));
  return <ReachScreen data={data} initial={{ ...view, selection: knownSelection(view.selection, data) }} />;
}
