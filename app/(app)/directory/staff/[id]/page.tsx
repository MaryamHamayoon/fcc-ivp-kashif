import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UserAvatar } from "@/components/common/Avatar";
import { DateText } from "@/components/common/DateText";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { MeetingHistoryList } from "@/components/directory/MeetingHistoryList";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/domain/policy";
import { getExpertProfile } from "@/lib/services/directory";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = await getExpertProfile(await getDb(), id);
  return { title: profile ? profile.name : "Expert" };
}

export default async function ExpertProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/directory/staff/${id}`);
  if (!can(toPolicyUser(user), "directory.read", { kind: "system" })) redirect("/forbidden");

  const profile = await getExpertProfile(await getDb(), id);
  if (!profile) notFound();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={profile.bureauName ?? "FCC staff"} title={profile.name} description={profile.title ?? undefined} />

      <section aria-label="Contact and engagement summary" className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-5">
          <UserAvatar name={profile.name} size="xl" decorative />
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <a href={`mailto:${profile.email}`} className="block font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm">
              {profile.email}
            </a>
            {profile.phone ? <p className="text-muted-foreground">{profile.phone}</p> : null}
            {!profile.active ? <Badge variant="outline">Inactive</Badge> : null}
          </div>
          <dl className="grid grid-cols-3 gap-6 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">Engagements</dt>
              <dd className="numeric text-2xl font-semibold">{profile.engagements}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Avg reply</dt>
              <dd className="numeric text-2xl font-semibold">{profile.avgReplyBusinessDays === null ? "—" : profile.avgReplyBusinessDays.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last briefed</dt>
              <dd className="text-sm font-medium">
                <DateText date={profile.lastBriefedAt} />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {profile.expertise.length > 0 ? (
        <section aria-labelledby="expertise-heading">
          <h2 id="expertise-heading" className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Expertise
          </h2>
          <ul className="flex flex-wrap gap-2" aria-label="Expertise">
            {profile.expertise.map((topic) => (
              <li key={topic.topicId}>
                <Badge variant="outline">
                  {topic.name} <span className="numeric text-muted-foreground">· {topic.count}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Engagement history
        </h2>
        <MeetingHistoryList items={profile.history} emptyMessage="Not yet assigned to a meeting." />
      </section>
    </div>
  );
}
