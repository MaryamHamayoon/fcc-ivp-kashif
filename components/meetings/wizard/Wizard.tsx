"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, Send, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StepCountry } from "./StepCountry";
import { StepDates } from "./StepDates";
import { StepLogistics } from "./StepLogistics";
import { StepRequestor } from "./StepRequestor";
import { StepReview } from "./StepReview";
import { StepTopics } from "./StepTopics";
import { useWizardDraft } from "./useWizardDraft";
import {
  fieldId,
  firstInvalidStep,
  REVIEW_STEP,
  toCreateInput,
  validateAll,
  validateStep,
  WIZARD_STEPS,
  type CreateMeetingAction,
  type FieldErrors,
  type WizardOptions,
} from "./wizard-schema";

const NO_ERRORS: FieldErrors = {};

/** Moves the reader to the control a message belongs to — the id convention does the work. */
function focusField(path: string): void {
  const id = fieldId(path);
  const anchor = document.getElementById(id);
  const control =
    anchor && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(anchor.tagName)
      ? anchor
      : (anchor?.querySelector<HTMLElement>("input, select, textarea, button") ?? document.querySelector<HTMLElement>(`input[name="${id}"]`));
  control?.focus();
}

/**
 * The six-step intake wizard.
 *
 * Every step validates on its own before the reader may move on, the whole draft is
 * mirrored to localStorage as they type, and the server action is only reached once
 * the complete request parses. Escape is never bound to anything destructive —
 * leaving the page and coming back offers the draft again.
 */
export function Wizard({ options, action, className }: { options: WizardOptions; action: CreateMeetingAction; className?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { draft, update, restorable, resume, startFresh, discard } = useWizardDraft();

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = WIZARD_STEPS[step] ?? WIZARD_STEPS[0];
  const reviewing = step === REVIEW_STEP;
  const liveErrors = useMemo(() => (reviewing ? validateAll(draft) : validateStep(step, draft)), [draft, step, reviewing]);
  // Messages appear once a step has been attempted, then track what the reader types.
  // The review always shows what is outstanding — it is the last chance to see it.
  const errors = reviewing || attempted[step] ? liveErrors : NO_ERRORS;
  const errorCount = Object.keys(errors).length;

  const stepIsValid = useMemo(() => WIZARD_STEPS.map((_, index) => (index === REVIEW_STEP ? true : Object.keys(validateStep(index, draft)).length === 0)), [draft]);

  function showProblems(target: number, problems: FieldErrors): void {
    setAttempted((seen) => ({ ...seen, [target]: true }));
    const first = Object.keys(problems)[0];
    if (first) window.requestAnimationFrame(() => focusField(first));
  }

  function goNext(): void {
    const problems = validateStep(step, draft);
    if (Object.keys(problems).length > 0) {
      showProblems(step, problems);
      return;
    }
    setStep((s) => Math.min(s + 1, REVIEW_STEP));
  }

  function jumpTo(target: number): void {
    if (target <= step) {
      setStep(target);
      return;
    }
    for (let index = step; index < target; index += 1) {
      const problems = validateStep(index, draft);
      if (Object.keys(problems).length > 0) {
        setStep(index);
        showProblems(index, problems);
        return;
      }
    }
    setStep(target);
  }

  function submit(): void {
    const problems = validateAll(draft);
    if (Object.keys(problems).length > 0) {
      const broken = firstInvalidStep(draft);
      setStep(broken);
      showProblems(broken, validateStep(broken, draft));
      return;
    }
    setSubmitError(null);
    const input = toCreateInput(draft);
    const headline = draft.delegation.headline;
    startTransition(async () => {
      const result = await action(input);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      discard();
      toast.success(`${result.code} created`, { description: headline });
      router.push(`/meetings/${result.id}`);
    });
  }

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10", className)}>
      <ol aria-label="Steps" className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:h-fit lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {WIZARD_STEPS.map((entry, index) => {
          const done = index < step && stepIsValid[index] === true;
          const active = index === step;
          return (
            <li key={entry.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => jumpTo(index)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "numeric inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold transition-colors",
                    done ? "border-ok/40 bg-ok/10 text-ok" : active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="truncate">{entry.title}</span>
                <span className="sr-only">{done ? " — completed" : active ? " — current step" : " — not started"}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0">
        {restorable ? (
          <section aria-labelledby="wizard-resume-heading" className="mb-5 rounded-md border border-brand/30 bg-accent/50 p-4 sm:p-5">
            <h2 id="wizard-resume-heading" className="text-sm font-semibold">
              Resume draft?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An unfinished request is saved in this browser
              {restorable.requestor.organizationName.trim() !== "" ? ` — ${restorable.requestor.organizationName.trim()}` : ""}
              {restorable.delegation.headline.trim() !== "" ? ` · ${restorable.delegation.headline.trim()}` : ""}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={resume} className={buttonVariants({ size: "sm" })}>
                <RotateCcw aria-hidden />
                Resume
              </button>
              <button type="button" onClick={startFresh} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Trash2 aria-hidden />
                Start fresh
              </button>
            </div>
          </section>
        ) : null}

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (reviewing) submit();
            else goNext();
          }}
        >
          <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
            <section aria-labelledby="wizard-step-heading" className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
              <header className="mb-5 border-b pb-4">
                <p className="eyebrow">
                  Step {step + 1} of {WIZARD_STEPS.length}
                </p>
                <h2 id="wizard-step-heading" className="heading-display mt-1 text-2xl">
                  {current.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{current.blurb}</p>
              </header>

              {step === 0 ? <StepRequestor value={draft.requestor} onChange={(requestor) => update((d) => ({ ...d, requestor }))} errors={errors} /> : null}
              {step === 1 ? (
                <StepCountry
                  countryCodes={draft.countryCodes}
                  regionId={draft.regionId}
                  leadUserId={draft.leadUserId}
                  onChange={(patch) => update((d) => ({ ...d, ...patch }))}
                  errors={errors}
                  countries={options.countries}
                  regions={options.regions}
                  leads={options.leads}
                />
              ) : null}
              {step === 2 ? <StepTopics delegation={draft.delegation} topics={draft.topics} onChange={(patch) => update((d) => ({ ...d, ...patch }))} errors={errors} topicOptions={options.topics} /> : null}
              {step === 3 ? <StepDates value={draft.dates} onChange={(dates) => update((d) => ({ ...d, dates }))} errors={errors} /> : null}
              {step === 4 ? (
                <StepLogistics logistics={draft.logistics} ochRequested={draft.ochRequested} onChange={(patch) => update((d) => ({ ...d, ...patch }))} errors={errors} />
              ) : null}
              {reviewing ? <StepReview draft={draft} options={options} onEdit={(target) => setStep(target)} errors={errors} /> : null}
            </section>
          </motion.div>

          {submitError ? (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{submitError}</span>
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              <ArrowLeft aria-hidden />
              Back
            </button>

            <p role="status" aria-live="polite" className="order-last w-full text-center text-xs text-muted-foreground sm:order-none sm:w-auto sm:text-left">
              {errorCount > 0 ? `${errorCount === 1 ? "One field needs" : `${errorCount} fields need`} a look before you continue.` : ""}
            </p>

            {reviewing ? (
              <button type="submit" disabled={pending} className={cn(buttonVariants({ size: "lg" }), "shadow-soft")}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {pending ? "Creating…" : "Create meeting"}
              </button>
            ) : (
              <button type="submit" className={cn(buttonVariants({ size: "lg" }), "shadow-soft")}>
                Next
                <ArrowRight aria-hidden />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
