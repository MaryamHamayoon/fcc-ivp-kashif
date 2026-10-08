"use client";

import { ArrowDown, ArrowUp, Check, Plus, Search, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { describedBy, FieldMessages, selectClass, TextAreaField, TextField } from "./fields";
import { emptyMember, fieldId, type DelegationDraft, type FieldErrors, type MemberDraft, type TopicDraft, type TopicOption } from "./wizard-schema";

export type DelegationPatch = { delegation?: DelegationDraft; topics?: TopicDraft[] };

const iconButton = "inline-flex size-7 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

/**
 * Step 3 — who is coming and what they came to ask.
 *
 * Topics are ranked rather than merely ticked: rank one decides which bureau is
 * asked for a briefer first, and the per-topic question is what the expert is
 * actually being handed.
 */
export function StepTopics({
  delegation,
  topics,
  onChange,
  errors,
  topicOptions,
}: {
  delegation: DelegationDraft;
  topics: TopicDraft[];
  onChange: (patch: DelegationPatch) => void;
  errors: FieldErrors;
  topicOptions: TopicOption[];
}) {
  const [query, setQuery] = useState("");
  const topicById = useMemo(() => new Map(topicOptions.map((t) => [t.id, t])), [topicOptions]);
  const chosen = new Set(topics.map((t) => t.topicId));
  const topicsId = fieldId("topics");

  const setDelegation = (patch: Partial<DelegationDraft>) => onChange({ delegation: { ...delegation, ...patch } });
  const setMember = (index: number, patch: Partial<MemberDraft>) => setDelegation({ members: delegation.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q === "" ? topicOptions : topicOptions.filter((t) => t.name.toLowerCase().includes(q) || t.group.toLowerCase().includes(q));
    const groups = new Map<string, TopicOption[]>();
    for (const topic of matches) {
      const list = groups.get(topic.group);
      if (list) list.push(topic);
      else groups.set(topic.group, [topic]);
    }
    return [...groups];
  }, [query, topicOptions]);

  function toggleTopic(topicId: string) {
    onChange({ topics: chosen.has(topicId) ? topics.filter((t) => t.topicId !== topicId) : [...topics, { topicId, detail: "" }] });
  }

  function moveTopic(index: number, delta: number) {
    const target = index + delta;
    const moved = topics[index];
    const displaced = topics[target];
    if (!moved || !displaced) return;
    const next = [...topics];
    next[index] = displaced;
    next[target] = moved;
    onChange({ topics: next });
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-5">
        <TextField
          id={fieldId("delegation.headline")}
          label="Meeting title"
          value={delegation.headline}
          onChange={(v) => setDelegation({ headline: v })}
          error={errors["delegation.headline"]}
          hint="How this visit will read in the tracker — “Spectrum sharing study visit”, not “Meeting”."
          placeholder="Spectrum sharing study visit"
          autoComplete="off"
        />
        <TextAreaField
          id={fieldId("delegation.purpose")}
          label="Purpose"
          value={delegation.purpose}
          onChange={(v) => setDelegation({ purpose: v })}
          error={errors["delegation.purpose"]}
          hint="A short paragraph in their words — it becomes the opening line of the briefing."
          optional
          autoComplete="off"
          rows={3}
        />
        <TextField
          id={fieldId("delegation.size")}
          label="Delegation size"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={delegation.size}
          onChange={(v) => setDelegation({ size: v })}
          error={errors["delegation.size"]}
          hint="Head count including interpreters. An estimate is fine — it sizes the room."
          autoComplete="off"
          className="max-w-40"
        />
      </div>

      <section aria-labelledby="wizard-delegates-heading" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="wizard-delegates-heading" className="text-sm font-semibold">
              Named delegates
            </h3>
            <p className="text-xs text-muted-foreground">Add the names you already have; the rest can be filled in later.</p>
          </div>
          <button type="button" onClick={() => setDelegation({ members: [...delegation.members, emptyMember()] })} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
            <UserPlus aria-hidden />
            Add delegate
          </button>
        </div>

        {delegation.members.length > 0 ? (
          <ul aria-label="Named delegates" className="grid gap-2.5">
            {delegation.members.map((member, index) => {
              const nameId = fieldId(`delegation.members.${index}.name`);
              const titleId = fieldId(`delegation.members.${index}.title`);
              const categoryId = fieldId(`delegation.members.${index}.category`);
              const interpreterId = fieldId(`delegation.members.${index}.isInterpreter`);
              const nameError = errors[`delegation.members.${index}.name`];
              return (
                <li key={member.key} className="rounded-xl border bg-card/60 p-3">
                  <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,10rem)_auto]">
                    <div>
                      <label htmlFor={nameId} className="sr-only">
                        Delegate {index + 1} name
                      </label>
                      <Input
                        id={nameId}
                        value={member.name}
                        placeholder="Name"
                        autoComplete="off"
                        aria-invalid={nameError ? true : undefined}
                        aria-describedby={describedBy(nameId, undefined, nameError)}
                        onChange={(e) => setMember(index, { name: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label htmlFor={titleId} className="sr-only">
                        Delegate {index + 1} title
                      </label>
                      <Input id={titleId} value={member.title} placeholder="Title" autoComplete="off" onChange={(e) => setMember(index, { title: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <label htmlFor={categoryId} className="sr-only">
                        Delegate {index + 1} category
                      </label>
                      <select id={categoryId} value={member.category} onChange={(e) => setMember(index, { category: e.target.value as MemberDraft["category"] })} className={selectClass}>
                        {PARTICIPANT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {PARTICIPANT_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <span className="flex items-center gap-1.5">
                        <Checkbox id={interpreterId} checked={member.isInterpreter} onCheckedChange={(checked) => setMember(index, { isInterpreter: checked })} aria-labelledby={`${interpreterId}-label`} />
                        <span id={`${interpreterId}-label`} className="text-xs text-muted-foreground">
                          Interpreter
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove delegate ${index + 1}`}
                        onClick={() => setDelegation({ members: delegation.members.filter((_, i) => i !== index) })}
                        className={iconButton}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <FieldMessages id={nameId} error={nameError} />
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="wizard-topics-heading" className="grid gap-3">
        <div>
          <h3 id="wizard-topics-heading" className="text-sm font-semibold">
            Topics, most important first
          </h3>
          <p className="text-xs text-muted-foreground">Rank one decides which bureau is asked for a briefer first.</p>
        </div>

        {topics.length > 0 ? (
          <ol aria-label="Chosen topics, most important first" className="grid gap-2.5">
            {topics.map((topic, index) => {
              const name = topicById.get(topic.topicId)?.name ?? topic.topicId;
              const detailId = fieldId(`topics.${index}.detail`);
              const detailError = errors[`topics.${index}.detail`];
              return (
                <li key={topic.topicId} className="rounded-xl border bg-card p-3 shadow-soft">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="numeric inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => moveTopic(index, -1)} className={iconButton}>
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label={`Move ${name} down`} disabled={index === topics.length - 1} onClick={() => moveTopic(index, 1)} className={iconButton}>
                        <ArrowDown className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label={`Remove ${name}`} onClick={() => toggleTopic(topic.topicId)} className={iconButton}>
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </div>
                  <label htmlFor={detailId} className="sr-only">
                    Their question about {name}
                  </label>
                  <Textarea
                    id={detailId}
                    rows={2}
                    value={topic.detail}
                    placeholder="What do they want to know? (optional)"
                    autoComplete="off"
                    aria-invalid={detailError ? true : undefined}
                    aria-describedby={describedBy(detailId, undefined, detailError)}
                    onChange={(e) => onChange({ topics: topics.map((t, i) => (i === index ? { ...t, detail: e.target.value } : t)) })}
                    className="mt-2.5 text-sm"
                  />
                  <FieldMessages id={detailId} error={detailError} />
                </li>
              );
            })}
          </ol>
        ) : null}

        <fieldset className="rounded-xl border bg-card/60 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Available topics</legend>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={topicsId}
              value={query}
              aria-label="Filter topics"
              placeholder="Filter topics…"
              autoComplete="off"
              aria-invalid={errors["topics"] ? true : undefined}
              aria-describedby={describedBy(topicsId, undefined, errors["topics"])}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter here adds the top match rather than advancing the step.
                const first = filtered[0]?.[1][0];
                if (e.key !== "Enter" || !first) return;
                e.preventDefault();
                toggleTopic(first.id);
                setQuery("");
              }}
              className="h-8 pl-8"
            />
          </div>
          <FieldMessages id={topicsId} error={errors["topics"]} />
          <div className="mt-3 grid max-h-64 gap-3 overflow-y-auto pr-1">
            {filtered.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No topic matches that filter.</p> : null}
            {filtered.map(([group, items]) => (
              <div key={group}>
                <p className="eyebrow mb-1.5">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((topic) => {
                    const selected = chosen.has(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTopic(topic.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-primary/50 bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                        )}
                      >
                        {selected ? <Check className="size-3" aria-hidden /> : <Plus className="size-3" aria-hidden />}
                        {topic.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
