// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MobileNav } from "@/components/shell/MobileNav";
import type { NavCounts } from "@/components/shell/nav";
import { __resetNavOpenCache } from "@/components/shell/NavTree";
import { SideRail } from "@/components/shell/SideRail";
import { SkipLink } from "@/components/shell/SkipLink";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth/session";
import { formatDateNY, formatNumber, formatRange, relativeAge } from "@/lib/format";
import { type NavMode, PREFERENCES_STORAGE_KEY } from "@/lib/preferences/schema";
import { __resetPreferencesCache, getPreferences, resetPreferences } from "@/lib/preferences/store";

const route = vi.hoisted(() => ({ pathname: "/meetings/abc", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// The account block imports the sign-out server action, which would drag the database in with it.
vi.mock("@/app/(auth)/login/actions", () => ({ signOut: vi.fn() }));

const user: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya.raman@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const counts = (over: Partial<NavCounts> = {}): NavCounts => ({ attention: 0, active: 24, upcoming: 9, ...over });

/** The rail's style and fold are display preferences; this is what stored ones look like before the page loads. */
const storedRail = (rail: { nav?: NavMode; collapsed?: "no" | "yes" }) => {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(rail));
  __resetPreferencesCache();
};

/** Where the rail thinks the reader is. */
const at = (pathname: string, search = "") => {
  route.pathname = pathname;
  route.search = search;
};

const primary = () => screen.getByRole("navigation", { name: /primary/i });

/** The app wraps the shell in a tooltip provider; the collapsed rail's labels depend on it. */
function renderRail(ui: ReactElement) {
  const wrap = (node: ReactElement) => <TooltipProvider delay={0}>{node}</TooltipProvider>;
  const view = render(wrap(ui));
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}

afterEach(() => {
  cleanup();
  resetPreferences();
  window.localStorage.clear();
  __resetNavOpenCache();
  at("/meetings/abc");
});

describe("side rail", () => {
  it("is navigation and nothing else — search and the account controls moved to the top bar", () => {
    renderRail(<SideRail user={user} counts={counts()} />);
    const rail = screen.getByRole("complementary", { name: /sidebar/i });
    expect(within(rail).queryByRole("button", { name: "Search" })).toBeNull();
    // Its width is CSS keyed on <html>, and the hybrid appearance hangs its dark tokens here.
    expect(rail).toHaveAttribute("data-side-rail");
    expect(rail).toHaveAttribute("data-rail-surface");
    // The seal and the program name stay; the department line above them does not.
    expect(within(rail).getByRole("link", { name: /international visitors program/i })).toHaveAttribute("href", "/");
    expect(within(rail).queryByText(/federal communications commission/i)).toBeNull();
  });

  it("hangs the workspace's views and layouts under Meetings, and the lists under People & places", () => {
    at("/");
    renderRail(<SideRail user={user} counts={counts()} />);
    const nav = primary();
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Meetings" })).toHaveAttribute("href", "/meetings");
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("href", "/meetings?layout=board");
    expect(within(nav).getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/meetings?layout=calendar");
    expect(within(nav).getByRole("link", { name: "People & places" })).toHaveAttribute("href", "/directory");
    expect(within(nav).getByRole("link", { name: "Organizations" })).toHaveAttribute("href", "/directory?tab=organizations");
    expect(within(nav).getByRole("link", { name: "Countries" })).toHaveAttribute("href", "/countries");
    // Documents and Reports are live rows now, not promises; nothing in the rail is disabled.
    expect(within(nav).getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/documents");
    expect(within(nav).getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(document.querySelector("[aria-disabled='true']")).toBeNull();
  });

  it("keeps Reports out of an expert's rail, since the policy would refuse them the page", () => {
    at("/");
    renderRail(<SideRail user={{ ...user, role: "expert", regionIds: [] }} counts={counts()} />);
    const nav = primary();
    expect(within(nav).getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/documents");
    expect(within(nav).queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("treats the dashboard as current only on the root path", () => {
    at("/");
    renderRail(<SideRail user={user} counts={counts()} />);
    expect(within(primary()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(primary()).getByRole("link", { name: "Meetings" })).not.toHaveAttribute("aria-current");
  });

  it("marks the saved view the meetings workspace is showing, and only that one", () => {
    at("/meetings", "layout=board");
    renderRail(<SideRail user={user} counts={counts()} />);
    const nav = primary();
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /^Active/ })).not.toHaveAttribute("aria-current");
    // The group is lit but not "current": the child owns the location.
    expect(within(nav).getByRole("link", { name: "Meetings" })).not.toHaveAttribute("aria-current");
  });

  it("reads /meetings with no query as Active", () => {
    at("/meetings");
    renderRail(<SideRail user={user} counts={counts()} />);
    expect(within(primary()).getByRole("link", { name: /^Active/ })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Meetings current on a record, with no child claiming the page", () => {
    at("/meetings/abc");
    renderRail(<SideRail user={user} counts={counts()} />);
    const nav = primary();
    expect(within(nav).getByRole("link", { name: "Meetings" })).toHaveAttribute("aria-current", "page");
    for (const child of ["Board", "Calendar", "Upcoming"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(`^${child}`) })).not.toHaveAttribute("aria-current");
    }
  });

  it("follows the directory's tab and the country pages into People & places", () => {
    at("/directory", "tab=organizations");
    const view = renderRail(<SideRail user={user} counts={counts()} />);
    expect(within(primary()).getByRole("link", { name: "Organizations" })).toHaveAttribute("aria-current", "page");

    at("/countries/KE");
    view.rerender(<SideRail user={user} counts={counts()} />);
    expect(within(primary()).getByRole("link", { name: "Countries" })).toHaveAttribute("aria-current", "page");
    expect(within(primary()).getByRole("link", { name: "Experts" })).not.toHaveAttribute("aria-current");
  });

  it("carries the tallies the rows lead to, spoken as counts of meetings", () => {
    at("/meetings");
    renderRail(<SideRail user={user} counts={counts({ active: 24, upcoming: 1 })} />);
    const nav = primary();
    expect(within(nav).getByRole("link", { name: /^Active/ })).toHaveTextContent("24");
    expect(within(within(nav).getByRole("link", { name: /^Active/ })).getByText("24 meetings")).toBeInTheDocument();
    expect(within(within(nav).getByRole("link", { name: /^Upcoming/ })).getByText("1 meeting")).toBeInTheDocument();
  });

  it("puts the attention count on the Dashboard row, spoken as a sentence", () => {
    renderRail(<SideRail user={user} counts={counts({ attention: 7 })} />);
    const dashboard = within(primary()).getByRole("link", { name: /dashboard/i });
    expect(dashboard).toHaveTextContent("7");
    expect(within(dashboard).getByText("7 items need attention")).toBeInTheDocument();
  });

  it("says nothing about attention when nothing is owed", () => {
    renderRail(<SideRail user={user} counts={counts()} />);
    expect(screen.queryByText(/items? needs? attention/i)).toBeNull();
  });

  it("folds a group away and remembers it, without touching the others", async () => {
    at("/"); // standing outside Meetings, so nothing re-opens it under us
    renderRail(<SideRail user={user} counts={counts()} />);

    const chevron = screen.getByRole("button", { name: "Hide Meetings pages" });
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(chevron.getAttribute("aria-controls") ?? "");
    expect(region).not.toBeNull();

    await userEvent.click(chevron);
    expect(JSON.parse(window.localStorage.getItem("ivp.nav") ?? "{}")).toEqual({ meetings: false });
    const reopen = await screen.findByRole("button", { name: "Show Meetings pages" });
    expect(reopen).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Hide People & places pages" })).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(reopen);
    expect(JSON.parse(window.localStorage.getItem("ivp.nav") ?? "{}")).toEqual({ meetings: true });
  });

  it("re-opens a folded group when the route lands inside it", async () => {
    at("/");
    window.localStorage.setItem("ivp.nav", JSON.stringify({ meetings: false }));
    const view = renderRail(<SideRail user={user} counts={counts()} />);
    expect(screen.getByRole("button", { name: "Show Meetings pages" })).toBeInTheDocument();

    at("/meetings", "layout=board");
    view.rerender(<SideRail user={user} counts={counts()} />);
    expect(await screen.findByRole("button", { name: "Hide Meetings pages" })).toBeInTheDocument();
  });

  it("collapses to icons, and keeps every label spoken", () => {
    at("/meetings", "layout=board");
    storedRail({ collapsed: "yes" });
    renderRail(<SideRail user={user} counts={counts({ attention: 3 })} />);

    const nav = primary();
    // No children and no chevrons at 4rem — just the six destinations, the log sitting before the library.
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/meetings", "/directory", "/activity", "/documents", "/reports"]);
    expect(within(nav).queryByRole("button", { name: /Meetings pages/ })).toBeNull();
    // The group still shows it is where you are, even though the child is out of sight.
    expect(within(nav).getByRole("link", { name: "Meetings" })).toHaveClass("bg-sidebar-accent");

    const dashboard = within(nav).getByRole("link", { name: /dashboard/i });
    expect(within(dashboard).getByText("3 items need attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();

    // A sighted reader gets the label from the hover tooltip; everyone else gets it from here.
    const people = within(nav).getByRole("link", { name: "People & places" });
    expect(within(people).getByText("People & places")).toHaveClass("sr-only");
  });

  it("carries the account block at its foot, naming the person and their role", () => {
    renderRail(<SideRail user={user} counts={counts()} />);
    const rail = screen.getByRole("complementary", { name: /sidebar/i });
    const account = within(rail).getByRole("button", { name: "Account menu — Priya Raman, Coordinator" });
    expect(account).toHaveTextContent("Priya Raman");
    expect(account).toHaveTextContent("priya.raman@fcc.gov");
  });

  it("folds to icons and back from its foot, and the fold is remembered without touching the rail's style", async () => {
    storedRail({ nav: "standard" });
    renderRail(<SideRail user={user} counts={counts()} />);
    const collapse = screen.getByRole("button", { name: "Collapse navigation" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(collapse);
    expect(getPreferences().collapsed).toBe("yes");
    expect(getPreferences().nav).toBe("standard");
    expect(document.documentElement).toHaveAttribute("data-collapsed", "yes");
    expect(document.documentElement).not.toHaveAttribute("data-nav");
    const expand = await screen.findByRole("button", { name: "Expand navigation" });
    expect(expand).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(expand);
    expect(getPreferences().collapsed).toBe("no");
    expect(document.documentElement).not.toHaveAttribute("data-collapsed");
    expect(await screen.findByRole("button", { name: "Collapse navigation" })).toHaveAttribute("aria-expanded", "true");
  });

  it("stays floating while it is collapsed — folding a floating rail never turns it into the standard one", async () => {
    storedRail({ nav: "floating" });
    renderRail(<SideRail user={user} counts={counts()} />);

    await userEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    // Both at once: the panel keeps floating clear of the edges, and only its width changes.
    expect(getPreferences()).toMatchObject({ nav: "floating", collapsed: "yes" });
    expect(document.documentElement).toHaveAttribute("data-nav", "floating");
    expect(document.documentElement).toHaveAttribute("data-collapsed", "yes");
    expect(within(primary()).queryByRole("button", { name: /Meetings pages/ })).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Expand navigation" }));
    expect(getPreferences()).toMatchObject({ nav: "floating", collapsed: "no" });
    expect(document.documentElement).toHaveAttribute("data-nav", "floating");
    expect(document.documentElement).not.toHaveAttribute("data-collapsed");
  });

  it("comes back collapsed and floating on the next visit, exactly as it was left", () => {
    storedRail({ nav: "floating", collapsed: "yes" });
    renderRail(<SideRail user={user} counts={counts()} />);

    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(getPreferences().nav).toBe("floating");
  });

  it("marks the pieces a 4rem rail cannot hold, so the collapsed stylesheet can hide them until React takes over", () => {
    renderRail(<SideRail user={user} counts={counts()} />);
    // The server renders the wide rows; these markers are what `html[data-collapsed="yes"]` hides pre-hydration.
    expect(screen.getByRole("button", { name: "Hide Meetings pages" })).toHaveAttribute("data-rail-fold");
    expect(document.querySelectorAll("[data-rail-children]").length).toBeGreaterThan(0);
  });
});

describe("account menu", () => {
  it("hands light and dark to the display panel rather than keeping a switch of its own", async () => {
    renderRail(<SideRail user={user} counts={counts()} />);
    await userEvent.click(screen.getByRole("button", { name: "Account menu — Priya Raman, Coordinator" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitemradio")).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: /display & accessibility/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });
});

describe("mobile sheet", () => {
  it("opens onto the same tree and the same account block", async () => {
    render(<MobileNav user={user} counts={counts({ attention: 4 })} />);
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveAttribute("data-rail-surface");
    const nav = within(sheet).getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: "Meetings" })).toHaveAttribute("href", "/meetings");
    expect(within(nav).getByRole("link", { name: "Countries" })).toHaveAttribute("href", "/countries");
    expect(within(nav).getByText("4 items need attention")).toBeInTheDocument();
    expect(within(sheet).queryByText(/federal communications commission/i)).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Account menu — Priya Raman, Coordinator" })).toBeInTheDocument();
  });
});

describe("skip link", () => {
  it("targets the main landmark", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main");
  });
});

describe("formatting", () => {
  const d = new Date("2026-08-29T14:00:00Z"); // 10:00 AM EDT, Saturday
  it("formats dates in Washington time", () => {
    expect(formatDateNY(d, "short")).toBe("Aug 29, 2026");
    expect(formatDateNY(d, "long")).toBe("August 29, 2026");
    expect(formatDateNY(d, "time")).toBe("10:00 AM");
    expect(formatDateNY(d, "month")).toBe("Aug 2026");
    expect(formatDateNY(d, "weekday")).toBe("Sat, Aug 29");
  });
  it("can leave the year off, on the Washington day and not the UTC one", () => {
    expect(formatDateNY(d, "monthday")).toBe("Aug 29");
    expect(formatDateNY(new Date("2026-08-30T01:30:00Z"), "monthday")).toBe("Aug 29");
  });
  it("formats ranges compactly", () => {
    expect(formatRange(d, new Date("2026-08-29T15:30:00Z"))).toBe("Aug 29, 2026 · 10:00–11:30 AM");
    expect(formatRange(d, new Date("2026-09-02T14:00:00Z"))).toBe("Aug 29 – Sep 2, 2026");
    expect(formatRange(d, null)).toBe("Aug 29, 2026 · 10:00 AM");
  });
  it("formats numbers and relative ages", () => {
    expect(formatNumber(12345)).toBe("12,345");
    const now = new Date("2026-08-29T14:00:00Z");
    expect(relativeAge(new Date("2026-08-29T09:00:00Z"), now)).toBe("today");
    expect(relativeAge(new Date("2026-08-28T09:00:00Z"), now)).toBe("yesterday");
    expect(relativeAge(new Date("2026-08-26T09:00:00Z"), now)).toBe("3 days ago");
    expect(relativeAge(new Date("2026-08-10T09:00:00Z"), now)).toBe("3 weeks ago");
    expect(relativeAge(new Date("2026-09-02T09:00:00Z"), now)).toBe("in 4 days");
    expect(relativeAge(new Date("2026-08-30T09:00:00Z"), now)).toBe("tomorrow");
  });
});
