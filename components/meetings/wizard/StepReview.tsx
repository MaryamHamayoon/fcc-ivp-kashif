"use client";

import { Pencil } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Flag } from "@/components/common/Flag";
import { buttonVariants } from "@/components/ui/button";
import { formatDateNY, formatRange } from "@/lib/format";
import { FORMAT_LABELS, ORG_KIND_LABELS, PARTICIPANT_CATEGORY_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { INTERPRETER_LABELS, parseWallClock, type FieldErrors, type WizardDraft, type WizardOptions } from "./wizard-schema";

type Row = { label: string; value: ReactNode };
type Section = { step: number; title: string; rows: Row[] };

const EM_DASH = "—";

function blank(value: string | undefined): ReactNode {
  return value && value.trim() !== "" ? value : <span className="text-muted-foreground">{EM_DASH}</span>;
}

function dateText(value: string, end?: string): ReactNode {
  const start = parseWallClock(value);
  if (!start) return <span className="text-muted-foreground">{EM_DASH}</span>;
  const finish = end ? parseWallClock(end) : null;
  return finish ? formatRange(start, finish) : `${formatDateNY(start, "short")} · ${formatDateNY(start, "time")}`;
}

/**
 * Step 6 — the whole request on one page, with a way back into any step that needs
 * a change. Nothing here is editable: the point is to read it once as the requester
 * will, then commit.
 */
export function StepReview({ draft, options, onEdit, errors }: { draft: WizardDraft; options: WizardOptions; onEdit: (step: number) => void; errors: FieldErrors }) {
  const countryName = (code: string) => options.countries.find((c) => c.code === code)?.name ?? code;
  const topicName = (id: string) => options.topics.find((t) => t.id === id)?.name ?? id;
  const region = options.regions.find((r) => r.id === draft.regionId);
  const lead = options.leads.find((l) => l.id === draft.leadUserId);
  const members = draft.delegation.members.filter((m) => m.name.trim() !== "");

  const sections: Section[] = [
    {
      step: 0,
      title: "Requestor",
      rows: [
        { label: "Name", value: blank(draft.requestor.name) },
        { label: "Title", value: blank(draft.requestor.title) },
        { label: "Organization", value: `${draft.requestor.organizationName}${draft.requestor.organizationKind ? ` · ${ORG_KIND_LABELS[draft.requestor.organizationKind]}` : ""}` },
        { label: "Email", value: blank(draft.requestor.email) },
        { label: "Phone", value: blank(draft.requestor.phone) },
        { label: "Requested through", value: blank(draft.requestor.viaIntermediary) },
      ],
    },
    {
      step: 1,
      title: "Country & lead",
      rows: [
        {
          label: "Countries",
          value:
            draft.countryCodes.length === 0 ? (
              blank("")
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {draft.countryCodes.map((code) => (
                  <span key={code} className="inline-flex items-center gap-1.5">
                    <Flag code={code} size={11} />
                    <span>{countryName(code)}</span>
                  </span>
                ))}
              </span>
            ),
        },
        { label: "Region", value: blank(region?.name) },
        { label: "OIA lead", value: lead ? lead.name : <span className="text-muted-foreground">Assigned automatically</span> },
      ],
    },
    {
      step: 2,
      title: "Delegation & topics",
      rows: [
        { label: "Meeting title", value: blank(draft.delegation.headline) },
        { label: "Purpose", value: blank(draft.delegation.purpose) },
        { label: "Size", value: draft.delegation.size === "" ? blank("") : `${draft.delegation.size} people` },
        {
          label: "Named delegates",
          value:
            members.length === 0 ? (
              <span className="text-muted-foreground">None yet</span>
            ) : (
              <ul className="grid gap-1">
                {members.map((member) => (
                  <li key={member.key}>
                    {member.name}
                    {member.title ? <span className="text-muted-foreground"> · {member.title}</span> : null}
                    <span className="text-muted-foreground"> · {PARTICIPANT_CATEGORY_LABELS[member.category]}</span>
                    {member.isInterpreter ? <span className="text-muted-foreground"> · interpreter</span> : null}
                  </li>
                ))}
              </ul>
            ),
        },
        {
          label: "Topics",
          value:
            draft.topics.length === 0 ? (
              blank("")
            ) : (
              <ol className="grid gap-1.5">
                {draft.topics.map((topic, index) => (
                  <li key={topic.topicId}>
                    <span className="font-medium">
                      {index + 1}. {topicName(topic.topicId)}
                    </span>
                    {topic.detail.trim() !== "" ? <span className="block text-muted-foreground">“{topic.detail}”</span> : null}
                  </li>
                ))}
              </ol>
            ),
        },
      ],
    },
    {
      step: 3,
      title: "Dates & format",
      rows: [
        { label: "Preferred", value: dateText(draft.dates.preferredStart, draft.dates.preferredEnd) },
        { label: "Alternate", value: draft.dates.alternateStart === "" ? <span className="text-muted-foreground">None offered</span> : dateText(draft.dates.alternateStart) },
        { label: "Format", value: draft.dates.format ? FORMAT_LABELS[draft.dates.format] : blank("") },
        { label: "Time zone", value: draft.dates.timezone },
      ],
    },
    {
      step: 4,
      title: "Logistics",
      rows: [
        { label: "Audio-visual", value: draft.logistics.needsAv ? "Needed" : <span className="text-muted-foreground">Not needed</span> },
        { label: "Interpretation", value: INTERPRETER_LABELS[draft.logistics.interpreter] },
        { label: "Accommodations", value: blank(draft.logistics.accommodations) },
        { label: "Local contact", value: blank(draft.logistics.localContact) },
        { label: "Background link", value: blank(draft.logistics.backgroundUrl) },
        { label: "Office of the Chairman", value: draft.ochRequested ? "Requested" : <span className="text-muted-foreground">Not requested</span> },
      ],
    },
  ];

  const problems = Object.keys(errors).length;

  return (
    <div className="grid gap-4">
      {problems > 0 ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {problems === 1 ? "One field still needs a look" : `${problems} fields still need a look`} — use Edit to go back and fix them.
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.step} aria-labelledby={`review-${section.step}`} className="rounded-xl border bg-card/60 p-4">
          <header className="mb-3 flex items-center justify-between gap-3 border-b pb-2.5">
            <h3 id={`review-${section.step}`} className="text-sm font-semibold">
              {section.title}
            </h3>
            <button type="button" aria-label={`Edit ${section.title.toLowerCase()}`} onClick={() => onEdit(section.step)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}>
              <Pencil aria-hidden />
              Edit
            </button>
          </header>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            {section.rows.map((row) => (
              <Fragment key={row.label}>
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{row.label}</dt>
                <dd className="text-sm leading-relaxed">{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
