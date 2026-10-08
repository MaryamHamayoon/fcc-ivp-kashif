"use client";

import { Bookmark, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fyLabel } from "@/lib/domain/glance";
import { isViewActive, makeSavedViewsStore, MAX_VIEW_NAME, useSavedViews, viewQuery } from "@/lib/saved-views";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import type { MeetingsFilterOptions } from "./options";
import { MEETING_FILTER_KEYS } from "./useMeetingsQuery";

/** What a view remembers: the filters, the search and the scope. Layout and sort are how you look, not what at. */
export const VIEW_KEYS = [...MEETING_FILTER_KEYS, "q", "view"] as const;
const CLEARED: ParamPatch = Object.fromEntries(VIEW_KEYS.map((key) => [key, null]));

export const meetingsViewsStore = makeSavedViewsStore("ivp.views.meetings");

type BuiltInView = { id: string; label: string; hint: string; params: Record<string, string> };

/** The questions the office asks that one scope tab cannot answer on its own. */
export function builtInViews(options: MeetingsFilterOptions): BuiltInView[] {
  const fy = options.currentFiscalYear;
  const views: BuiltInView[] = [
    { id: "clearance", label: "In clearance", hint: "Active, waiting on internal clearance", params: { status: "clearance" } },
    { id: "completed-fy", label: `Completed ${fyLabel(fy)}`, hint: `Held in fiscal year ${fy}`, params: { view: "completed", fy: String(fy) } },
  ];
  if (options.myRegion) views.push({ id: "my-region", label: "My region", hint: `Active visits from ${options.myRegion.label}`, params: { regionId: options.myRegion.value } });
  if (options.spaceBureauCode) views.push({ id: "space", label: "Space Bureau", hint: "Active visits the Space Bureau briefs", params: { bureauCode: options.spaceBureauCode } });
  views.push({ id: "och", label: "OCH attending", hint: "The Chairman's office is joining", params: { och: "true" } });
  return views;
}

/** A saved query string back into a patch: everything a view owns is cleared, then its own values set. */
function patchFromQuery(query: string): ParamPatch {
  const saved = new URLSearchParams(query);
  const patch: ParamPatch = { ...CLEARED };
  for (const key of VIEW_KEYS) {
    const values = saved.getAll(key);
    if (values.length) patch[key] = values;
  }
  return patch;
}

function ViewRow({ href, active, label, hint, onNavigate, className }: { href: string; active: boolean; label: string; hint?: string; onNavigate: () => void; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      onClick={onNavigate}
      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none", className)}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint ? <span className="block truncate text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      </span>
      {active ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
    </Link>
  );
}

/**
 * The Views menu: the built-in views, then the reader's own, and a way to save whatever is set
 * right now under a name. Each view is a link, so it can be opened in a new tab or bookmarked.
 */
export function ViewsMenu({ params, options, hrefFor, className }: { params: URLSearchParams; options: MeetingsFilterOptions; hrefFor: (patch: ParamPatch) => string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const saved = useSavedViews(meetingsViewsStore);
  const current = viewQuery(params, VIEW_KEYS);
  const builtIns = builtInViews(options);
  const isBuiltInActive = (view: BuiltInView) => viewQuery(new URLSearchParams(view.params), VIEW_KEYS) === current;
  const anyActive = builtIns.some(isBuiltInActive) || saved.some((view) => isViewActive(view, params, VIEW_KEYS));

  const close = () => setOpen(false);

  const saveRef = useRef<HTMLButtonElement>(null);
  const deleteRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** Saving and deleting unmount the control the reader is standing on; React leaves focus on the body unless we move it. */
  const nextFocus = useRef<(() => HTMLElement | null | undefined) | null>(null);

  useLayoutEffect(() => {
    const pick = nextFocus.current;
    if (!pick) return;
    nextFocus.current = null;
    (pick() ?? saveRef.current)?.focus();
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // The field goes away with the form, so focus returns to the button that opened it.
    nextFocus.current = () => saveRef.current;
    meetingsViewsStore.save(trimmed, current);
    setName("");
    setNaming(false);
    toast.success("View saved", { description: trimmed });
  };

  /** Focus takes the delete button that slides into the deleted row's place, or the last one left. */
  const removeView = (id: string, index: number) => {
    const rest = saved.filter((view) => view.id !== id);
    const next = rest[index] ?? rest[index - 1];
    nextFocus.current = () => (next ? deleteRefs.current.get(next.id) : null);
    meetingsViewsStore.remove(id);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setNaming(false);
          setName("");
        }
      }}
    >
      <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), anyActive && "text-primary", className)}>
        <Bookmark aria-hidden />
        Views
        <ChevronDown className="size-3 opacity-50" aria-hidden />
      </PopoverTrigger>
      {/* To a screen reader the popup is a dialog, so it carries the menu's name. */}
      <PopoverContent aria-label="Views" align="end" className="w-72 gap-0 p-1">
        <p className="eyebrow px-2 pt-1.5 pb-1">Views</p>
        {builtIns.map((view) => (
          <ViewRow key={view.id} href={hrefFor({ ...CLEARED, ...view.params })} active={isBuiltInActive(view)} label={view.label} hint={view.hint} onNavigate={close} />
        ))}

        <div aria-hidden className="my-1 h-px bg-border" />
        <p className="eyebrow px-2 pt-1.5 pb-1">Saved</p>
        {saved.length === 0 && !naming ? <p className="px-2 pb-1.5 text-xs text-muted-foreground">Nothing saved yet. Set the filters you want, then save them here.</p> : null}
        {saved.map((view, index) => (
          <div key={view.id} className="flex items-center gap-0.5">
            <ViewRow href={hrefFor(patchFromQuery(view.query))} active={isViewActive(view, params, VIEW_KEYS)} label={view.name} onNavigate={close} className="min-w-0 flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              ref={(node) => {
                deleteRefs.current.set(view.id, node);
                return () => {
                  deleteRefs.current.delete(view.id);
                };
              }}
              onClick={() => removeView(view.id, index)}
              title="Delete this view"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden />
              <span className="sr-only">Delete {view.name}</span>
            </Button>
          </div>
        ))}

        {naming ? (
          <form onSubmit={submit} className="mt-1 flex items-center gap-1 p-1">
            <Input autoFocus aria-label="View name" placeholder="Name this view" value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_VIEW_NAME} className="h-7 text-[0.8125rem]" />
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Save
            </Button>
          </form>
        ) : (
          <button
            ref={saveRef}
            type="button"
            onClick={() => setNaming(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
          >
            <Plus className="size-3.5" aria-hidden />
            Save current as…
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
