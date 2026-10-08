"use client";

import { Building2, Clock3, Monitor, Users } from "lucide-react";
import { FORMAT_LABELS, MEETING_FORMATS, type MeetingFormat } from "@/lib/domain/types";
import { RadioCards, TextField, type CardOption } from "./fields";
import { fieldId, type DatesDraft, type FieldErrors } from "./wizard-schema";

const FORMAT_ICONS: Record<MeetingFormat, React.ReactNode> = {
  in_person: <Building2 className="size-4 text-muted-foreground" aria-hidden />,
  virtual: <Monitor className="size-4 text-muted-foreground" aria-hidden />,
  hybrid: <Users className="size-4 text-muted-foreground" aria-hidden />,
};

const FORMAT_BLURBS: Record<MeetingFormat, string> = {
  in_person: "They travel to the Portals.",
  virtual: "Everyone joins from their own desk.",
  hybrid: "Some in the room, some on the link.",
};

const FORMAT_OPTIONS: readonly CardOption<MeetingFormat>[] = MEETING_FORMATS.map((format) => ({
  value: format,
  label: FORMAT_LABELS[format],
  description: FORMAT_BLURBS[format],
  icon: FORMAT_ICONS[format],
}));

/**
 * Step 4 — when and how. Both dates are recorded as proposals by the visitor;
 * nothing is scheduled until someone accepts one on the meeting record.
 */
export function StepDates({ value, onChange, errors }: { value: DatesDraft; onChange: (next: DatesDraft) => void; errors: FieldErrors }) {
  const set = <K extends keyof DatesDraft>(key: K, next: DatesDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-6">
      <p className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Clock3 className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Times are Washington, DC — <span className="font-medium text-foreground">America/New_York</span>. Enter what the delegation asked for; the date is only a proposal until it is accepted on the record.
        </span>
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={fieldId("dates.preferredStart")}
          label="Preferred start"
          type="datetime-local"
          value={value.preferredStart}
          onChange={(v) => set("preferredStart", v)}
          error={errors["dates.preferredStart"]}
          hint="The date and time they asked for."
          autoComplete="off"
        />
        <TextField
          id={fieldId("dates.preferredEnd")}
          label="Preferred end"
          type="datetime-local"
          value={value.preferredEnd}
          onChange={(v) => set("preferredEnd", v)}
          error={errors["dates.preferredEnd"]}
          hint="Leave blank for a standard 90-minute slot."
          optional
          autoComplete="off"
        />
        <TextField
          id={fieldId("dates.alternateStart")}
          label="Alternate start"
          type="datetime-local"
          value={value.alternateStart}
          onChange={(v) => set("alternateStart", v)}
          error={errors["dates.alternateStart"]}
          hint="A second option saves a round of email when the first cannot be staffed."
          optional
          autoComplete="off"
          className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]"
        />
      </div>

      <RadioCards
        name={fieldId("dates.format")}
        legend="Meeting format"
        value={value.format}
        onChange={(format) => set("format", format)}
        options={FORMAT_OPTIONS}
        error={errors["dates.format"]}
      />
    </div>
  );
}
