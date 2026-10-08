"use client";

import { ArrowUpRight, Mail, Phone, X } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useId, useState } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { CopyButton } from "@/components/common/CopyButton";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDateNY, telHref } from "@/lib/format";
import type { ExpertSummary } from "@/lib/services/directory";
import { cn } from "@/lib/utils";

const delay = (ms: number) => ({ "--arrive-delay": `${ms}ms` }) as CSSProperties;

const LINK = "rounded-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * The program's mark — a globe's lines of longitude and latitude — drawn in across the band as
 * the card opens. The one flourish on the card; everything under it is plain.
 */
function BandGlobe() {
  const R = 96;
  const longitudes = [0.24, 0.5, 0.76];
  const latitudes = [-58, -22, 22, 58];
  return (
    <svg aria-hidden viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.9" className="pointer-events-none absolute -top-[4.25rem] -right-9 size-60 text-white/[0.16]">
      <circle cx="100" cy="100" r={R} pathLength={1} className="draw-line" />
      {longitudes.map((f, i) => (
        <ellipse key={f} cx="100" cy="100" rx={R * f} ry={R} pathLength={1} className="draw-line" style={delay(90 + i * 70)} />
      ))}
      <line x1={100} y1={100 - R} x2={100} y2={100 + R} pathLength={1} className="draw-line" style={delay(60)} />
      {latitudes.map((dy, i) => {
        const half = Math.sqrt(R * R - dy * dy);
        return <line key={dy} x1={100 - half} y1={100 + dy} x2={100 + half} y2={100 + dy} pathLength={1} className="draw-line" style={delay(160 + i * 60)} />;
      })}
    </svg>
  );
}

function ContactRow({ icon: Icon, children, copy }: { icon: typeof Mail; children: ReactNode; copy: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{children}</span>
      {copy}
    </li>
  );
}

/** One figure: the number over its name. The name comes first in the markup, where a definition list wants it. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-1 px-3.5 py-3">
      <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className="flex h-6 items-end gap-1 leading-none">{children}</dd>
    </div>
  );
}

const BIG = "numeric text-xl font-semibold leading-none text-foreground";
const SMALL = "pb-px text-xs leading-none text-muted-foreground";

function ProfileCard({ expert }: { expert: ExpertSummary }) {
  const topicsId = useId();
  const firstName = expert.name.trim().split(/\s+/)[0] ?? expert.name;
  const tel = expert.phone ? telHref(expert.phone) : null;
  const busiest = Math.max(1, ...expert.expertise.map((topic) => topic.count));

  return (
    <>
      <div className="band-surface relative isolate h-[5.5rem] shrink-0 overflow-hidden">
        <BandGlobe />
        <p className="absolute top-4 left-5 flex max-w-[70%] items-center gap-2 text-xs text-band-muted">
          {expert.bureauCode ? <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-band-foreground">{expert.bureauCode}</span> : null}
          <span className="truncate">{expert.bureauName ?? "Federal Communications Commission"}</span>
        </p>
        <DialogClose className="absolute top-2.5 right-2.5 inline-flex size-7 items-center justify-center rounded-md text-band-foreground/85 transition-colors hover:bg-white/15 hover:text-band-foreground focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:outline-none">
          <X aria-hidden className="size-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </div>

      <div className="px-5 pb-5">
        {/* Positioned, so it sits over the band it overlaps rather than under it. */}
        <UserAvatar name={expert.name} size="xl" decorative className="relative z-10 -mt-8 size-16 text-xl ring-4 ring-popover" />
        <DialogTitle className="heading-display mt-3 text-xl leading-tight">{expert.name}</DialogTitle>
        {expert.title ? <DialogDescription className="mt-1 text-[0.8125rem]">{expert.title}</DialogDescription> : null}

        <ul aria-label="Contact" className="mt-4 divide-y rounded-lg border">
          <ContactRow icon={Mail} copy={<CopyButton value={expert.email} what="email address" />}>
            <a href={`mailto:${expert.email}`} className={LINK}>
              {expert.email}
            </a>
          </ContactRow>
          {expert.phone ? (
            <ContactRow icon={Phone} copy={<CopyButton value={expert.phone} what="phone number" />}>
              {tel ? (
                <a href={tel} className={cn(LINK, "tabular-nums")}>
                  {expert.phone}
                </a>
              ) : (
                <span className="font-medium tabular-nums">{expert.phone}</span>
              )}
            </ContactRow>
          ) : null}
        </ul>

        <div role="group" aria-label="With the program" className="mt-3">
          <dl className="grid grid-cols-[auto_auto_1fr] divide-x rounded-lg border bg-muted/40">
            <Figure label="Engagements">
              <span className={BIG}>{expert.engagements}</span>
            </Figure>
            <Figure label="Avg reply">
              {expert.avgReplyBusinessDays === null ? (
                <span className={SMALL}>No replies yet</span>
              ) : (
                <>
                  <span className={BIG}>{expert.avgReplyBusinessDays.toFixed(1)}</span> <span className={SMALL}>days</span>
                </>
              )}
            </Figure>
            <Figure label="Last briefed">
              {expert.lastBriefedAt ? (
                <time dateTime={expert.lastBriefedAt.toISOString()} className="text-sm leading-none font-semibold text-foreground">
                  {formatDateNY(expert.lastBriefedAt)}
                </time>
              ) : (
                <span className={SMALL}>Never</span>
              )}
            </Figure>
          </dl>
        </div>

        <h3 id={topicsId} className="mt-5 text-xs font-semibold text-muted-foreground">
          Briefs on
        </h3>
        {expert.expertise.length > 0 ? (
          <ul aria-labelledby={topicsId} className="mt-2.5 space-y-2.5">
            {expert.expertise.map((topic, i) => (
              <li key={topic.topicId}>
                <span className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="truncate">{topic.name}</span>
                  <span className="numeric shrink-0 text-xs text-muted-foreground">
                    {topic.count}
                    <span className="sr-only"> {topic.count === 1 ? "briefing" : "briefings"}</span>
                  </span>
                </span>
                <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="grow-x block h-full rounded-full bg-primary" style={{ width: `${(topic.count / busiest) * 100}%`, ...delay(140 + i * 80) }} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">No briefings on record yet.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-5 py-3">
        <Link href={`/directory/staff/${expert.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5")}>
          Open full profile
          <ArrowUpRight aria-hidden />
        </Link>
        <a href={`mailto:${expert.email}`} className={buttonVariants({ size: "sm" })}>
          <Mail aria-hidden />
          Email {firstName}
        </a>
      </div>
    </>
  );
}

/**
 * A person's card, opened from their row: who they are, how to reach them — each address one
 * press from the clipboard — and what the program knows of them. It holds the last person it
 * showed, so the card does not empty while it is closing.
 */
export function ExpertProfileDialog({ expert, onClose }: { expert: ExpertSummary | null; onClose: () => void }) {
  const [last, setLast] = useState(expert);
  if (expert && expert !== last) setLast(expert);
  const shown = expert ?? last;

  return (
    <Dialog
      open={expert !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {shown ? (
        <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-x-hidden overflow-y-auto p-0 shadow-2xl sm:max-w-[26rem]">
          {/* Keyed by person, so the lines and bars arrive again for each card. */}
          <ProfileCard key={shown.id} expert={shown} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
