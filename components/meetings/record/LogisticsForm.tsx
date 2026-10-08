"use client";

import { Check, Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { SelectField, SwitchField, TextAreaField, TextField } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { INTERPRETER_MODES, type InterpreterMode, type MeetingFormat } from "@/lib/domain/types";
import { ActionError, useRecordAction, type LogisticsRecordAction } from "./tab-actions";

/**
 * Room, link and access. Two of these fields are readiness checks — an in-person meeting needs
 * a room, a virtual one needs a link — so the form asks only for what this meeting's format
 * actually requires, and says which answer the ring is waiting on.
 */

const INTERPRETER_LABELS: Record<InterpreterMode, string> = {
  none: "No interpretation",
  consecutive: "Consecutive",
  simultaneous: "Simultaneous",
};

export type LogisticsValues = {
  location: string | null;
  virtualLink: string | null;
  needsAv: boolean;
  interpreter: InterpreterMode;
  accommodations: string | null;
  localContact: string | null;
};

export function LogisticsForm({
  meetingId,
  format,
  values,
  canUpdate,
  updateLogistics,
}: {
  meetingId: string;
  format: MeetingFormat;
  values: LogisticsValues;
  canUpdate: boolean;
  updateLogistics: LogisticsRecordAction;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [location, setLocation] = useState(values.location ?? "");
  const [virtualLink, setVirtualLink] = useState(values.virtualLink ?? "");
  const [needsAv, setNeedsAv] = useState(values.needsAv);
  const [interpreter, setInterpreter] = useState<InterpreterMode>(values.interpreter);
  const [accommodations, setAccommodations] = useState(values.accommodations ?? "");
  const [localContact, setLocalContact] = useState(values.localContact ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const needsLocation = format === "in_person" || format === "hybrid";
  const needsLink = format === "virtual" || format === "hybrid";
  const disabled = !canUpdate;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(null);
    run(() => updateLogistics({ meetingId, location, virtualLink, needsAv, interpreter, accommodations, localContact }), {
      success: "Logistics saved.",
      onDone: (result) => setSaved(result.changed.length === 0 ? "Nothing had changed." : `Saved — ${result.changed.join("; ")}.`),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <fieldset disabled={disabled} className="grid gap-4">
        {needsLocation ? (
          <TextField
            id={`${ids}-location`}
            label="Room"
            value={location}
            onChange={setLocation}
            placeholder="Room 8-B516, 45 L Street NE"
            hint={location.trim() === "" ? "The readiness ring is waiting on this." : "Include the floor and building — visitors are escorted from the lobby."}
          />
        ) : null}

        {needsLink ? (
          <TextField
            id={`${ids}-link`}
            label="Virtual link"
            type="url"
            inputMode="url"
            value={virtualLink}
            onChange={setVirtualLink}
            placeholder="https://fcc.zoomgov.com/j/…"
            hint={virtualLink.trim() === "" ? "The readiness ring is waiting on this." : "Shared with the delegation in the confirmation email."}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id={`${ids}-interpreter`} label="Interpretation" value={interpreter} onChange={(value) => setInterpreter(value as InterpreterMode)}>
            {INTERPRETER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {INTERPRETER_LABELS[mode]}
              </option>
            ))}
          </SelectField>
          <SwitchField id={`${ids}-av`} label="A/V support" description="Projection, recording or a hybrid bridge." checked={needsAv} onChange={setNeedsAv} />
        </div>

        <TextField id={`${ids}-contact`} label="Local contact" optional value={localContact} onChange={setLocalContact} placeholder="Embassy escort, name and mobile" />
        <TextAreaField
          id={`${ids}-accommodations`}
          label="Accommodations"
          optional
          rows={2}
          value={accommodations}
          onChange={setAccommodations}
          placeholder="Step-free access from the L Street entrance; one wheelchair space at the table."
        />
      </fieldset>

      <ActionError message={error} />

      {canUpdate ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {saved ? (
            <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-ok">
              <Check className="size-3.5" aria-hidden />
              {saved}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save logistics
          </button>
        </div>
      ) : null}
    </form>
  );
}
