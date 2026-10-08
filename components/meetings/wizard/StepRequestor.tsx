"use client";

import { ORG_KIND_LABELS, ORG_KINDS } from "@/lib/domain/types";
import { SelectField, TextField } from "./fields";
import { fieldId, type FieldErrors, type RequestorDraft } from "./wizard-schema";

/**
 * Step 1 — who asked. The intermediary line matters: most IVP requests arrive
 * through an embassy, the State Department or the ITU rather than from the
 * regulator directly, and the record has to say which.
 */
export function StepRequestor({ value, onChange, errors }: { value: RequestorDraft; onChange: (next: RequestorDraft) => void; errors: FieldErrors }) {
  const set = <K extends keyof RequestorDraft>(key: K, next: RequestorDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField
        id={fieldId("requestor.name")}
        label="Full name"
        value={value.name}
        onChange={(v) => set("name", v)}
        error={errors["requestor.name"]}
        placeholder="Kouassi Mensah"
        autoComplete="off"
      />
      <TextField
        id={fieldId("requestor.title")}
        label="Title or role"
        value={value.title}
        onChange={(v) => set("title", v)}
        error={errors["requestor.title"]}
        placeholder="Director General"
        optional
        autoComplete="off"
      />
      <TextField
        id={fieldId("requestor.organizationName")}
        label="Organization"
        value={value.organizationName}
        onChange={(v) => set("organizationName", v)}
        error={errors["requestor.organizationName"]}
        hint="Spell it out or use the acronym — an existing organization is matched automatically."
        placeholder="ARTCI"
        autoComplete="off"
      />
      <SelectField
        id={fieldId("requestor.organizationKind")}
        label="Kind of organization"
        value={value.organizationKind}
        onChange={(v) => set("organizationKind", v as RequestorDraft["organizationKind"])}
        error={errors["requestor.organizationKind"]}
        placeholder="Choose one…"
      >
        {ORG_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ORG_KIND_LABELS[kind]}
          </option>
        ))}
      </SelectField>
      <TextField
        id={fieldId("requestor.email")}
        label="Email"
        type="email"
        inputMode="email"
        value={value.email}
        onChange={(v) => set("email", v)}
        error={errors["requestor.email"]}
        placeholder="name@regulator.example"
        autoComplete="off"
      />
      <TextField
        id={fieldId("requestor.phone")}
        label="Phone"
        type="tel"
        inputMode="tel"
        value={value.phone}
        onChange={(v) => set("phone", v)}
        error={errors["requestor.phone"]}
        optional
        autoComplete="off"
      />
      <TextField
        id={fieldId("requestor.viaIntermediary")}
        label="Requested through"
        value={value.viaIntermediary}
        onChange={(v) => set("viaIntermediary", v)}
        error={errors["requestor.viaIntermediary"]}
        hint="Embassy, State Department, ITU — leave blank when they wrote to OIA directly."
        placeholder="Embassy of Côte d'Ivoire"
        optional
        autoComplete="off"
        className="sm:col-span-2"
      />
    </div>
  );
}
