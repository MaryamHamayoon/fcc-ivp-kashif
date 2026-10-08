import { BarChart3, BookUser, FileText, Handshake, History, LayoutDashboard, type LucideIcon, Search } from "lucide-react";
import { type Action, can, type PolicyUser } from "@/lib/domain/policy";

/**
 * The shape of the navigation, as data.
 *
 * Meetings is the workspace; its saved views and its layouts are the same page seen four ways,
 * so they hang off it rather than competing with it in a flat list. People & places gathers the
 * three reference lists; Activity (every meeting's log in one place), Documents and Reports
 * stand on their own. Nothing here is React, because the fiddly part — deciding what is lit
 * when the destination is a query string rather than a path — deserves to be unit-tested on
 * its own, and read on one screen.
 */

/** The tallies the rail carries. Every one is computed server-side; none is ever typed by anyone. */
export type NavCounts = { attention: number; active: number; upcoming: number };

/** Which tally a row's pill shows; the Dashboard's attention count has its own (warn) pill. */
export type NavCountKey = Exclude<keyof NavCounts, "attention">;

export type NavChild = {
  id: string;
  label: string;
  href: string;
  count?: NavCountKey;
};

export type NavGroup = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** True for the one row that carries the needs-attention count. */
  attention?: boolean;
  /** A policy action the reader must hold for the row to appear at all; absent means everyone. */
  requires?: Action;
  children?: readonly NavChild[];
};

export const NAV_TREE: readonly NavGroup[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, attention: true },
  {
    id: "meetings",
    label: "Meetings",
    href: "/meetings",
    icon: Handshake,
    children: [
      { id: "meetings-active", label: "Active", href: "/meetings", count: "active" },
      { id: "meetings-upcoming", label: "Upcoming", href: "/meetings?view=upcoming", count: "upcoming" },
      { id: "meetings-board", label: "Board", href: "/meetings?layout=board" },
      { id: "meetings-calendar", label: "Calendar", href: "/meetings?layout=calendar" },
    ],
  },
  {
    id: "people",
    label: "People & places",
    href: "/directory",
    icon: BookUser,
    children: [
      { id: "people-experts", label: "Experts", href: "/directory?tab=experts" },
      { id: "people-organizations", label: "Organizations", href: "/directory?tab=organizations" },
      { id: "people-countries", label: "Countries", href: "/countries" },
    ],
  },
  { id: "activity", label: "Activity", href: "/activity", icon: History },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText },
  { id: "reports", label: "Reports", href: "/reports", icon: BarChart3, requires: "reports.read" },
];

/**
 * The tree as one reader gets it. A row whose page the policy would refuse is left out rather
 * than shown and then met with a 403: an expert has no Reports row, and never wonders why.
 */
export function navGroupsFor(user: PolicyUser): NavGroup[] {
  return NAV_TREE.filter((group) => !group.requires || can(user, group.requires, { kind: "system" }));
}

/* ------------------------------- matching -------------------------------- */

export type NavMatch = { groupId: string | null; childId: string | null };

/** Anything with `URLSearchParams.get` — Next's read-only flavour included. */
export type NavSearch = { get(key: string): string | null } | null | undefined;

const NOTHING: NavMatch = { groupId: null, childId: null };

const get = (search: NavSearch, key: string): string | null => search?.get(key) ?? null;

const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/**
 * What the rail should light for a location. The URL is the state everywhere in this app, so
 * "which row am I on" is a question about the query string as much as the path: `/meetings`
 * is four different rows depending on `layout` and `view`.
 */
export function matchNav(pathname: string, search?: NavSearch): NavMatch {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return { groupId: "dashboard", childId: null };

  if (within(path, "/meetings")) {
    // A record, the wizard and every tab under them belong to Meetings, but to no saved view.
    if (path !== "/meetings") return { groupId: "meetings", childId: null };
    const layout = get(search, "layout");
    if (layout === "board") return { groupId: "meetings", childId: "meetings-board" };
    if (layout === "calendar") return { groupId: "meetings", childId: "meetings-calendar" };
    if (layout) return { groupId: "meetings", childId: null };
    const view = get(search, "view");
    if (!view || view === "active") return { groupId: "meetings", childId: "meetings-active" };
    if (view === "upcoming") return { groupId: "meetings", childId: "meetings-upcoming" };
    return { groupId: "meetings", childId: null };
  }

  if (within(path, "/directory")) {
    if (within(path, "/directory/organizations")) return { groupId: "people", childId: "people-organizations" };
    if (within(path, "/directory/staff")) return { groupId: "people", childId: "people-experts" };
    if (path !== "/directory") return { groupId: "people", childId: null };
    const tab = get(search, "tab");
    if (!tab || tab === "experts") return { groupId: "people", childId: "people-experts" };
    if (tab === "organizations") return { groupId: "people", childId: "people-organizations" };
    return { groupId: "people", childId: null };
  }

  if (within(path, "/countries")) return { groupId: "people", childId: "people-countries" };

  // The feed's scope, filters and page live in the query string; so do the library's drawer and filters.
  if (within(path, "/activity")) return { groupId: "activity", childId: null };
  if (within(path, "/documents")) return { groupId: "documents", childId: null };
  if (within(path, "/reports")) return { groupId: "reports", childId: null };

  return NOTHING;
}

/* ------------------------------ page heading ------------------------------ */

/** What the top bar prints on its left: the section, its icon, and the part of it the page is. */
export type PageHeading = {
  label: string;
  icon: LucideIcon;
  /** Named only when the page below does not already say it: a layout, a place, the intake form. */
  detail: string | null;
};

/**
 * The page's name, as the rail names it. The bar is one component on every screen, so it reads
 * the name off the URL the same way the rail reads what to light. Scopes and directory tabs are
 * left out of `detail` because the page's own tabs already show them.
 */
export function pageHeading(pathname: string, search?: NavSearch): PageHeading | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (within(path, "/search")) return { label: "Search", icon: Search, detail: null };

  const { groupId, childId } = matchNav(path, search);
  const group = NAV_TREE.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  const child = group.children?.find((candidate) => candidate.id === childId);

  let detail: string | null = null;
  if (group.id === "meetings") {
    if (path === "/meetings/new") detail = "New meeting";
    else if (childId === "meetings-board" || childId === "meetings-calendar") detail = child?.label ?? null;
  } else if (group.id === "people") {
    if (path !== "/directory") detail = child?.label ?? null;
  } else if (group.id === "reports" && within(path, "/reports/brief")) {
    detail = "Executive brief";
  }
  return { label: group.label, icon: group.icon, detail };
}

/* --------------------------- open / closed state --------------------------- */

/** Group id → whether its children are showing. Absent means "as it comes": open. */
export type NavOpenState = Record<string, boolean>;

/** The localStorage key; the same idiom as the rail's own collapse preference. */
export const NAV_OPEN_STORAGE_KEY = "ivp.nav";

export function groupIsOpen(state: NavOpenState, id: string): boolean {
  return state[id] ?? true;
}

/** Tolerant: anything that is not a map of booleans is treated as nothing stored at all. */
export function parseNavOpen(raw: string | null | undefined): NavOpenState {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const state: NavOpenState = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "boolean") state[id] = value;
  }
  return state;
}

export function serializeNavOpen(state: NavOpenState): string {
  return JSON.stringify(state);
}
