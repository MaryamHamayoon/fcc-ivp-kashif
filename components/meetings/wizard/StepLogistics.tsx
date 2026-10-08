"use client";

import { INTERPRETER_MODES, type InterpreterMode } from "@/lib/domain/types";
import { RadioCards, SwitchField, TextAreaField, TextField, type CardOption } from "./fields";
import { fieldId, INTERPRETER_LABELS, type FieldErrors, type LogisticsDraft } from "./wizard-schema";

const INTERPRETER_BLURBS: Record<InterpreterMode, string> = {
  none: "The delegation works in English.",
  consecutive: "They bring an interpreter who speaks after each turn.",
  simultaneous: "Booth and headsets — book the room early.",
};

const INTERPRETER_OPTIONS: readonly CardOption<InterpreterMode>[] = INTERPRETER_MODES.map((mode) => ({
  value: mode,
  label: INTERPRETER_LABELS[mode],
  description: INTERPRETER_BLURBS[mode],
}));

export type LogisticsPatch = { logistics?: LogisticsDraft; ochRequested?: boolean };

/**
 * Step 5 — everything that has to be arranged before the day. All of it is optional;
 * the point is that a backup coordinator can run the visit from this record alone.
 */
export function StepLogistics({
  logistics,
  ochRequested,
  onChange,
  errors,
}: {
  logistics: LogisticsDraft;
  ochRequested: boolean;
  onChange: (patch: LogisticsPatch) => void;
  errors: FieldErrors;
}) {
  const set = <K extends keyof LogisticsDraft>(key: K, next: LogisticsDraft[K]) => onChange({ logistics: { ...logistics, [key]: next } });

  return (
    <div className="grid gap-6">
      <SwitchField
        id={fieldId("logistics.needsAv")}
        label="Audio-visual support"
        description="Projection, a video link or recording — flags the room request early."
        checked={logistics.needsAv}
        onChange={(checked) => set("needsAv", checked)}
      />

      <RadioCards
        name={fieldId("logistics.interpreter")}
        legend="Interpretation"
        value={logistics.interpreter}
        onChange={(mode) => set("interpreter", mode)}
        options={INTERPRETER_OPTIONS}
        error={errors["logistics.interpreter"]}
      />

      <TextAreaField
        id={fieldId("logistics.accommodations")}
        label="Accommodations"
        value={logistics.accommodations}
        onChange={(v) => set("accommodations", v)}
        error={errors["logistics.accommodations"]}
        hint="Access needs, dietary requirements, security escorts — anything the day depends on."
        optional
        autoComplete="off"
        rows={3}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={fieldId("logistics.localContact")}
          label="Local contact"
          value={logistics.localContact}
          onChange={(v) => set("localContact", v)}
          error={errors["logistics.localContact"]}
          hint="Who to call on the day — usually an embassy officer."
          optional
          autoComplete="off"
        />
        <TextField
          id={fieldId("logistics.backgroundUrl")}
          label="Background link"
          type="url"
          inputMode="url"
          value={logistics.backgroundUrl}
          onChange={(v) => set("backgroundUrl", v)}
          error={errors["logistics.backgroundUrl"]}
          hint="An agenda, a delegation biography or the regulator's own page."
          placeholder="https://"
          optional
          autoComplete="off"
        />
      </div>

      <SwitchField
        id={fieldId("ochRequested")}
        label="Office of the Chairman requested"
        description="Turn this on when the delegation has asked for a Commissioner or the Chairman's office. It raises the meeting's priority and adds a clearance step."
        checked={ochRequested}
        onChange={(checked) => onChange({ ochRequested: checked })}
      />
    </div>
  );
}
