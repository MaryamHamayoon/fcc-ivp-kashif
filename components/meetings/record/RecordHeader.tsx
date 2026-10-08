import { ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/common/Avatar";
import { Flag } from "@/components/common/Flag";
import { CandidateDates } from "@/components/meetings/CandidateDates";
import { ReadinessRing } from "@/components/meetings/ReadinessRing";
import { StatusPill } from "@/components/meetings/StatusPill";
import type { TransitionAction } from "@/components/meetings/TransitionDialog";
import { FORMAT_LABELS } from "@/lib/domain/types";
import { formatRange } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { RecordActions, type ResumeAction } from "./RecordActions";

/**
 * The record's masthead: who is visiting, what the meeting is, where it stands and what the
 * reader can do about it. The delegation leads (flag and organization as an eyebrow) because
 * that is how coordinators name a meeting out loud; the IVP code stays in mono so it can be
 * copied into an email without a second glance.
 */
export function RecordHeader({ record, transition, resume, className }: { record: MeetingRecord; transition: TransitionAction; resume: ResumeAction; className?: string }) {
  // The same person often holds both jobs; say it once.
  const people: { role: string; name: string }[] = [];
  if (record.leadName !== null && record.leadName === record.coordinatorName) {
    people.push({ role: "Lead & coordinator", name: record.leadName });
  } else {
    if (record.leadName !== null) people.push({ role: "Lead", name: record.leadName });
    if (record.coordinatorName !== null) people.push({ role: "Coordinator", name: record.coordinatorName });
  }

  return (
    <header className={cn("min-w-0", className)}>
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-xs">
          <li>
            <Link href="/meetings" className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Meetings
            </Link>
          </li>
          <li aria-hidden className="text-muted-foreground/60">
            <ChevronRight className="size-3" />
          </li>
          <li>
            <span aria-current="page" className="numeric text-foreground">
              {record.code}
            </span>
          </li>
        </ol>
      </nav>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2">
            <Flag code={record.primaryCountryCode} size={12} />
            <span>{record.orgShortName ?? record.orgName ?? record.countryName}</span>
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            <span>{record.countryName}</span>
          </p>

          <h1 className="heading-display mt-1.5 text-3xl text-balance md:text-4xl">{record.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span className="numeric text-foreground">{record.code}</span>
            <StatusPill status={record.status} />
            {record.ochAttending ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-deep ring-1 ring-gold/40 ring-inset dark:text-gold">
                <Star className="size-3 fill-current" aria-hidden />
                OCH attending
              </span>
            ) : null}
            <span aria-hidden className="text-muted-foreground/40">
              |
            </span>
            <span>{FORMAT_LABELS[record.format]}</span>
            {record.scheduledStart ? <span className="text-foreground">{formatRange(record.scheduledStart, record.scheduledEnd)}</span> : <CandidateDates dates={record.candidateDates} />}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 lg:items-end">
          <RecordActions
            meetingId={record.id}
            code={record.code}
            status={record.status}
            allowed={record.allowed}
            hasAcceptedDate={record.hasAcceptedDate}
            resumesTo={record.resumesTo}
            permissions={record.permissions}
            transition={transition}
            resume={resume}
          />

          <div className="flex items-center gap-5">
            {people.map((person) => (
              <span key={person.role} className="flex items-center gap-2">
                <UserAvatar name={person.name} size="sm" decorative />
                <span className="leading-tight">
                  <span className="block text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{person.role}</span>
                  <span className="block text-sm font-medium whitespace-nowrap">{person.name}</span>
                </span>
              </span>
            ))}
            <ReadinessRing readiness={record.readiness} size={36} />
          </div>
        </div>
      </div>
    </header>
  );
}
