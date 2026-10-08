"use client";

import { Loader2, UserRoundPlus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { SelectField, SwitchField, TextField } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS, type ParticipantCategory } from "@/lib/domain/types";
import { ActionError, useRecordAction, type CreateRecordAction } from "./tab-actions";

/**
 * Adds one named person to the roster. Names arrive from the delegation by email in ones and
 * twos, so this is deliberately a small form — category, name, title — rather than an import.
 */
export function AddParticipantDialog({ meetingId, addParticipant }: { meetingId: string; addParticipant: CreateRecordAction }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <UserRoundPlus aria-hidden />
        Add person
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">{open ? <AddParticipantForm meetingId={meetingId} addParticipant={addParticipant} onClose={() => setOpen(false)} /> : null}</DialogContent>
      </Dialog>
    </>
  );
}

function AddParticipantForm({ meetingId, addParticipant, onClose }: { meetingId: string; addParticipant: CreateRecordAction; onClose: () => void }) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ParticipantCategory>("foreign_gov");
  const [isInterpreter, setIsInterpreter] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const nameError = attempted && name.trim().length < 2 ? "Enter the person's name." : undefined;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAttempted(true);
    if (name.trim().length < 2) return;
    run(() => addParticipant({ meetingId, name: name.trim(), title: title.trim() === "" ? undefined : title.trim(), category, isInterpreter }), {
      success: `${name.trim()} added to the roster.`,
      onDone: onClose,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add someone to the roster</DialogTitle>
        <DialogDescription>Named people feed the participant-list readiness check; the headcounts below the table cover anyone who arrives without a name on the list.</DialogDescription>
      </DialogHeader>

      <TextField id={`${ids}-name`} label="Name" value={name} onChange={setName} error={nameError} placeholder="Aminata Koné" autoComplete="off" />
      <TextField id={`${ids}-title`} label="Title" optional value={title} onChange={setTitle} placeholder="Director of International Cooperation" autoComplete="off" />
      <SelectField id={`${ids}-category`} label="Counts as" value={category} onChange={(value) => setCategory(value as ParticipantCategory)}>
        {PARTICIPANT_CATEGORIES.map((option) => (
          <option key={option} value={option}>
            {PARTICIPANT_CATEGORY_LABELS[option]}
          </option>
        ))}
      </SelectField>
      <SwitchField id={`${ids}-interpreter`} label="Interpreter" description="Attending to interpret rather than to take part." checked={isInterpreter} onChange={setIsInterpreter} />

      <ActionError message={error} />

      <DialogFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={buttonVariants()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Add to roster
        </button>
      </DialogFooter>
    </form>
  );
}
