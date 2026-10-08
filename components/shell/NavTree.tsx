"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { groupIsOpen, matchNav, NAV_OPEN_STORAGE_KEY, type NavCounts, type NavGroup, type NavMatch, type NavOpenState, type NavSearch, parseNavOpen, serializeNavOpen } from "./nav";

/* ------------------------- which groups are open -------------------------- */

/*
 * The same shape as the display preferences store: a module-level cache
 * that notifies every subscriber synchronously on write, so the sheet and the rail agree in the
 * same tick. The server snapshot is "nothing stored", which reads as every group open — which is
 * also what the first paint shows, so hydration matches.
 *
 * The snapshot carries `animate` alongside the state: a gesture (the chevron) should slide, while
 * a correction (what storage said, once hydration can read it) should simply be true from the
 * start. Without it, a reader who had folded a group would watch it fold itself on every load.
 */

type NavOpenSnapshot = { state: NavOpenState; animate: boolean };

const listeners = new Set<() => void>();
let cache: NavOpenSnapshot | null = null;
const ALL_OPEN: NavOpenState = {};
const CORRECTED = (state: NavOpenState): NavOpenSnapshot => ({ state, animate: false });

function readStored(): NavOpenState {
  try {
    return parseNavOpen(window.localStorage.getItem(NAV_OPEN_STORAGE_KEY));
  } catch {
    return ALL_OPEN; // private mode, or storage blocked by policy
  }
}

function snapshot(): NavOpenSnapshot {
  cache ??= CORRECTED(readStored());
  return cache;
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== NAV_OPEN_STORAGE_KEY) return;
  cache = null; // another tab's choice arrives already made, not as a movement
  notify();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function setGroupOpen(id: string, open: boolean, animate = true) {
  const state: NavOpenState = { ...snapshot().state, [id]: open };
  cache = { state, animate };
  try {
    window.localStorage.setItem(NAV_OPEN_STORAGE_KEY, serializeNavOpen(state));
  } catch {
    /* the choice simply doesn't survive the session */
  }
  notify();
}

const SERVER_SNAPSHOT: NavOpenSnapshot = { state: ALL_OPEN, animate: false };
const serverSnapshot = () => SERVER_SNAPSHOT;

/** Test seam: forget the cached value so the next read comes from storage. */
export function __resetNavOpenCache(): void {
  cache = null;
}

/* -------------------------------- pieces ---------------------------------- */

/** Every focusable thing in the rail wears the same ring, offset against the rail's own surface. */
const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

const rowClass = (filled: boolean, collapsed: boolean) =>
  cn(
    "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[0.8438rem] font-medium transition-colors",
    FOCUS_RING,
    filled ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted",
    collapsed && "justify-center px-0",
  );

const attentionLabel = (count: number) => (count === 1 ? "1 item needs attention" : `${count} items need attention`);

/**
 * The count of things owed, carried on the Dashboard row rather than a bell: the number belongs
 * beside the place that explains it. Collapsed, it shrinks to a dot and the number moves into
 * the tooltip — but the spoken sentence is the same either way.
 */
function AttentionPill({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (collapsed) {
    return (
      <>
        <span aria-hidden className="absolute right-3 top-1.5 size-2 rounded-full bg-warn ring-2 ring-sidebar" />
        <span className="sr-only">{attentionLabel(count)}</span>
      </>
    );
  }
  return (
    <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-warn/35 bg-card px-1.5 text-[0.6875rem] font-semibold tabular-nums text-warn">
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{attentionLabel(count)}</span>
    </span>
  );
}

/** How many meetings the row leads to. Filled on the row you are standing on, quiet everywhere else. */
function CountPill({ count, filled }: { count: number; filled: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums transition-colors",
        filled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden>{count > 999 ? "999+" : count}</span>
      <span className="sr-only">
        {count} {count === 1 ? "meeting" : "meetings"}
      </span>
    </span>
  );
}

/* --------------------------------- tree ----------------------------------- */

function GroupRow({
  group,
  match,
  counts,
  collapsed,
  onNavigate,
  regionId,
  open,
  instant,
  reduce,
}: {
  group: NavGroup;
  match: NavMatch;
  counts: NavCounts;
  collapsed: boolean;
  onNavigate?: () => void;
  regionId: string;
  open: boolean;
  instant: boolean;
  reduce: boolean;
}) {
  const Icon = group.icon;
  const active = match.groupId === group.id;
  const childActive = active && match.childId !== null;
  // The filled row marks the deepest thing that matched: the child when there is one, else the
  // group. Collapsed there are no children on screen, so the group takes the fill either way.
  const filled = active && (collapsed || !childActive);
  const flagged = Boolean(group.attention) && counts.attention > 0;
  const children = group.children ?? [];

  const body = (
    <>
      <Icon
        className={cn("size-[18px] shrink-0 transition-colors", filled ? "text-sidebar-accent-foreground" : active ? "text-brand" : "text-sidebar-muted group-hover:text-sidebar-foreground")}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className={cn("truncate", active && !filled && "font-semibold text-sidebar-foreground", collapsed && "sr-only")}>{group.label}</span>
      {flagged ? <AttentionPill count={counts.attention} collapsed={collapsed} /> : null}
    </>
  );

  // `aria-current="page"` marks the row that *is* the location; when a child owns it, the group
  // shows the state visually and leaves the word "current" to the child.
  const current = active && match.childId === null ? "page" : undefined;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<Link href={group.href} aria-current={current} onClick={onNavigate} className={rowClass(filled, true)} />}>{body}</TooltipTrigger>
        <TooltipContent side="right">{flagged ? `${group.label} — ${attentionLabel(counts.attention)}` : group.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <Link href={group.href} aria-current={current} onClick={onNavigate} className={cn(rowClass(filled, false), "min-w-0 flex-1")}>
          {body}
        </Link>
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={regionId}
            aria-label={`${open ? "Hide" : "Show"} ${group.label} pages`}
            data-rail-fold=""
            onClick={() => setGroupOpen(group.id, !open)}
            className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-muted hover:text-sidebar-foreground", FOCUS_RING)}
          >
            {/* The transition is always declared; the global reduced-motion rules in globals.css
                zero it out, which keeps the server's markup and the client's identical. */}
            <ChevronRight className={cn("size-4 transition-transform duration-200", open && "rotate-90")} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      {children.length > 0 ? (
        <motion.div
          id={regionId}
          data-rail-children=""
          inert={!open}
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={instant || reduce ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {/* The guide line sits under the parent icon's centre, so the children's text lands
              exactly under the parent's label rather than under its icon. */}
          <ul className="ml-[1.1875rem] flex flex-col gap-px border-l border-sidebar-border py-0.5 pl-[0.625rem]">
            {children.map((child) => {
              const on = match.childId === child.id;
              return (
                <li key={child.id}>
                  <Link
                    href={child.href}
                    aria-current={on ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-[0.8125rem] transition-colors",
                      FOCUS_RING,
                      on ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-muted hover:bg-muted hover:text-sidebar-foreground",
                    )}
                  >
                    <span className="truncate">{child.label}</span>
                    {child.count ? <CountPill count={counts[child.count]} filled={on} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ) : null}
    </div>
  );
}

type NavProps = { groups: readonly NavGroup[]; collapsed?: boolean; onNavigate?: () => void; counts: NavCounts };

function NavTree({ groups, collapsed = false, onNavigate, counts, search }: NavProps & { search: NavSearch }) {
  const pathname = usePathname() ?? "/";
  const match = matchNav(pathname, search);
  const { state: openState, animate } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const reduce = Boolean(useReducedMotion());
  const baseId = useId();

  // Landing inside a group the reader had folded away opens it again — otherwise the page you
  // are on is nowhere in the nav. Arriving that way on first load is a correction, not a
  // movement; walking into it later is worth seeing happen.
  const mounted = useRef(false);
  const activeGroup = match.groupId;
  useEffect(() => {
    if (activeGroup && !groupIsOpen(snapshot().state, activeGroup)) setGroupOpen(activeGroup, true, mounted.current);
    mounted.current = true;
  }, [activeGroup]);

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3">
      {groups.map((group) => (
        <GroupRow
          key={group.id}
          group={group}
          match={match}
          counts={counts}
          collapsed={collapsed}
          onNavigate={onNavigate}
          regionId={`${baseId}-${group.id}`}
          open={groupIsOpen(openState, group.id)}
          instant={!animate}
          reduce={reduce}
        />
      ))}
    </nav>
  );
}

function LiveNavTree(props: NavProps) {
  const search = useSearchParams();
  return <NavTree {...props} search={search} />;
}

/**
 * The navigation itself; shared by the desktop rail and the mobile sheet. What is highlighted
 * depends on the query string as well as the path, and `useSearchParams` opts its subtree out of
 * prerendering — hence the boundary, whose fallback is the same tree with nothing lit.
 */
export function RailNav(props: NavProps) {
  return (
    <Suspense fallback={<NavTree {...props} search={null} />}>
      <LiveNavTree {...props} />
    </Suspense>
  );
}
