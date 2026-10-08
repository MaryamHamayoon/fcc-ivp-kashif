"use client";

import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Form primitives shared by the wizard steps. Every control is labelled, every
 * message is wired to its control with aria-describedby, and every invalid control
 * carries aria-invalid — done once here rather than remembered six times.
 */

export function describedBy(id: string, hint?: ReactNode, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function FieldMessages({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * The "Optional" pill sits beside the `<label>` rather than inside it: a label's own
 * text becomes the control's accessible name, and "EmailOptional" is not a name.
 */
export function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
      </label>
      {optional ? <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Optional</span> : null}
    </div>
  );
}

export function Field({ id, label, hint, error, optional, className, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel htmlFor={id} optional={optional}>
        {label}
      </FieldLabel>
      {children}
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

type BaseFieldProps = { id: string; label: ReactNode; value: string; onChange: (value: string) => void; hint?: ReactNode; error?: string; optional?: boolean; placeholder?: string; className?: string; autoComplete?: string };

export function TextField({ id, label, value, onChange, hint, error, optional, placeholder, className, autoComplete, type = "text", inputMode, min, max, step }: BaseFieldProps & { type?: string; inputMode?: "text" | "numeric" | "email" | "tel" | "url"; min?: number; max?: number; step?: number }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <Input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      />
    </Field>
  );
}

export function TextAreaField({ id, label, value, onChange, hint, error, optional, placeholder, className, autoComplete, rows = 3 }: BaseFieldProps & { rows?: number }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export const selectClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50 dark:bg-input/30";

/**
 * A native `<select>`: it inherits the platform's own picker, keyboard model and
 * screen-reader behaviour, which no custom listbox matches on a government form.
 */
export function SelectField({ id, label, value, onChange, hint, error, optional, className, placeholder, children }: Omit<BaseFieldProps, "placeholder"> & { placeholder?: string; children: ReactNode }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(selectClass, value === "" && "text-muted-foreground")}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
    </Field>
  );
}

export function SwitchField({ id, label, description, checked, onChange, className }: { id: string; label: ReactNode; description?: ReactNode; checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-xl border bg-card/60 px-4 py-3", className)}>
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        {description ? (
          <span id={`${id}-hint`} className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-hint` : undefined} className="mt-0.5 shrink-0" />
    </div>
  );
}

export type CardOption<T extends string> = { value: T; label: string; description?: string; icon?: ReactNode };

/**
 * Radio cards. The accessible name is the option's label alone (via aria-labelledby);
 * the supporting line is a description, so a screen reader hears "In person, radio"
 * before the detail rather than one long run-on name.
 */
export function RadioCards<T extends string>({ name, legend, hint, error, value, onChange, options, columns = 3 }: { name: string; legend: ReactNode; hint?: ReactNode; error?: string; value: T | ""; onChange: (value: T) => void; options: readonly CardOption<T>[]; columns?: 2 | 3 }) {
  return (
    <fieldset aria-describedby={describedBy(name, hint, error)} aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2.5", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((option) => {
          const inputId = `${name}-${option.value}`;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-1 rounded-xl border bg-card px-3.5 py-3 transition-colors",
                "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                selected ? "border-primary/60 bg-accent/60 shadow-soft" : "hover:border-primary/30 hover:bg-muted/50",
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-labelledby={`${inputId}-label`}
                aria-describedby={option.description ? `${inputId}-desc` : undefined}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", selected ? "border-primary" : "border-input")}>
                  <span className={cn("size-2 rounded-full transition-transform", selected ? "scale-100 bg-primary" : "scale-0 bg-transparent")} />
                </span>
                {option.icon}
                <span id={`${inputId}-label`} className="text-sm font-medium">
                  {option.label}
                </span>
              </span>
              {option.description ? (
                <span id={`${inputId}-desc`} className="pl-6 text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldMessages id={name} hint={hint} error={error} />
    </fieldset>
  );
}
