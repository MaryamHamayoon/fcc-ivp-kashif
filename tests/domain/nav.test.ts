import { BarChart3, BookUser, Handshake, LayoutDashboard, Search } from "lucide-react";
import { groupIsOpen, matchNav, NAV_TREE, type NavOpenState, navGroupsFor, pageHeading, parseNavOpen, serializeNavOpen } from "@/components/shell/nav";
import type { PolicyUser } from "@/lib/domain/policy";

/** The rail reads `useSearchParams()`, which is a URLSearchParams in everything but name. */
const qs = (query = "") => new URLSearchParams(query);

describe("the navigation tree", () => {
  it("names the six destinations, in the order a coordinator works them", () => {
    expect(NAV_TREE.map((group) => group.id)).toEqual(["dashboard", "meetings", "people", "activity", "documents", "reports"]);
    expect(NAV_TREE.map((group) => group.label)).toEqual(["Dashboard", "Meetings", "People & places", "Activity", "Documents", "Reports"]);
    expect(NAV_TREE.map((group) => group.href)).toEqual(["/", "/meetings", "/directory", "/activity", "/documents", "/reports"]);
  });

  it("hangs the meetings workspace's layouts and saved views off Meetings", () => {
    const meetings = NAV_TREE.find((group) => group.id === "meetings")!;
    expect(meetings.href).toBe("/meetings");
    expect(meetings.children?.map((child) => [child.label, child.href])).toEqual([
      ["Active", "/meetings"],
      ["Upcoming", "/meetings?view=upcoming"],
      ["Board", "/meetings?layout=board"],
      ["Calendar", "/meetings?layout=calendar"],
    ]);
    // Only the two saved views carry a tally; a layout is the same rows in another shape.
    expect(meetings.children?.map((child) => child.count)).toEqual(["active", "upcoming", undefined, undefined]);
  });

  it("gathers the people and the places under one group", () => {
    const people = NAV_TREE.find((group) => group.id === "people")!;
    expect(people.href).toBe("/directory");
    expect(people.children?.map((child) => child.href)).toEqual(["/directory?tab=experts", "/directory?tab=organizations", "/countries"]);
  });

  it("keeps every id unique, so the open/closed state and the DOM ids cannot collide", () => {
    const ids = NAV_TREE.flatMap((group) => [group.id, ...(group.children ?? []).map((child) => child.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows Reports only to a reader the policy lets read them, and Documents to everyone", () => {
    const executive: PolicyUser = { id: "usr_exec", role: "executive", regionIds: [], staffId: null };
    const expert: PolicyUser = { id: "usr_expert", role: "expert", regionIds: [], staffId: "stf_x" };
    const viewer: PolicyUser = { id: "usr_viewer", role: "viewer", regionIds: [], staffId: null };
    expect(navGroupsFor(executive).map((group) => group.id)).toEqual(["dashboard", "meetings", "people", "activity", "documents", "reports"]);
    expect(navGroupsFor(expert).map((group) => group.id)).toEqual(["dashboard", "meetings", "people", "activity", "documents"]);
    expect(navGroupsFor(viewer).map((group) => group.id)).toEqual(["dashboard", "meetings", "people", "activity", "documents"]);
  });
});

describe("matchNav", () => {
  it("marks the dashboard only at the root", () => {
    expect(matchNav("/", qs())).toEqual({ groupId: "dashboard", childId: null });
    expect(matchNav("/meetings", qs()).groupId).not.toBe("dashboard");
  });

  it("reads the meetings workspace's own query string", () => {
    expect(matchNav("/meetings", qs())).toEqual({ groupId: "meetings", childId: "meetings-active" });
    expect(matchNav("/meetings", qs("view=active"))).toEqual({ groupId: "meetings", childId: "meetings-active" });
    expect(matchNav("/meetings", qs("view=upcoming"))).toEqual({ groupId: "meetings", childId: "meetings-upcoming" });
    expect(matchNav("/meetings", qs("layout=board"))).toEqual({ groupId: "meetings", childId: "meetings-board" });
    expect(matchNav("/meetings", qs("layout=calendar"))).toEqual({ groupId: "meetings", childId: "meetings-calendar" });
  });

  it("lets a layout win over the saved view, because that is what the page shows", () => {
    expect(matchNav("/meetings", qs("view=upcoming&layout=board"))).toEqual({ groupId: "meetings", childId: "meetings-board" });
    expect(matchNav("/meetings", qs("view=completed&layout=calendar"))).toEqual({ groupId: "meetings", childId: "meetings-calendar" });
  });

  it("keeps the group lit but highlights nothing when the reader is somewhere the tree cannot name", () => {
    expect(matchNav("/meetings", qs("view=on_hold"))).toEqual({ groupId: "meetings", childId: null });
    expect(matchNav("/meetings", qs("status=clearance"))).toEqual({ groupId: "meetings", childId: "meetings-active" });
    expect(matchNav("/meetings/abc", qs())).toEqual({ groupId: "meetings", childId: null });
    expect(matchNav("/meetings/new", qs())).toEqual({ groupId: "meetings", childId: null });
  });

  it("treats the directory's default tab as Experts", () => {
    expect(matchNav("/directory", qs())).toEqual({ groupId: "people", childId: "people-experts" });
    expect(matchNav("/directory", qs("tab=experts"))).toEqual({ groupId: "people", childId: "people-experts" });
    expect(matchNav("/directory", qs("tab=organizations"))).toEqual({ groupId: "people", childId: "people-organizations" });
    expect(matchNav("/directory/staff/stf_ana", qs())).toEqual({ groupId: "people", childId: "people-experts" });
    expect(matchNav("/directory/organizations/artci", qs())).toEqual({ groupId: "people", childId: "people-organizations" });
  });

  it("counts a country page as one of the places", () => {
    expect(matchNav("/countries", qs())).toEqual({ groupId: "people", childId: "people-countries" });
    expect(matchNav("/countries/KE", qs())).toEqual({ groupId: "people", childId: "people-countries" });
  });

  it("lights Activity on the feed, whatever it is filtered to", () => {
    expect(matchNav("/activity", qs())).toEqual({ groupId: "activity", childId: null });
    expect(matchNav("/activity", qs("scope=open&kind=call&page=3"))).toEqual({ groupId: "activity", childId: null });
  });

  it("lights Documents on the library, drawer open or not, and Reports on every report page", () => {
    expect(matchNav("/documents", qs())).toEqual({ groupId: "documents", childId: null });
    expect(matchNav("/documents", qs("doc=doc_1&kind=agenda_final"))).toEqual({ groupId: "documents", childId: null });
    expect(matchNav("/reports", qs())).toEqual({ groupId: "reports", childId: null });
    expect(matchNav("/reports/brief", qs("fy=2026"))).toEqual({ groupId: "reports", childId: null });
  });

  it("lights nothing on a page the rail does not lead to", () => {
    expect(matchNav("/search", qs("q=artci"))).toEqual({ groupId: null, childId: null });
    expect(matchNav("/meetings-archive", qs())).toEqual({ groupId: null, childId: null });
    expect(matchNav("/directory-of-things", qs())).toEqual({ groupId: null, childId: null });
  });

  it("survives a trailing slash and a missing query string", () => {
    expect(matchNav("/meetings/", null)).toEqual({ groupId: "meetings", childId: "meetings-active" });
    expect(matchNav("/", undefined)).toEqual({ groupId: "dashboard", childId: null });
  });

  it("points every child at a route the matcher then recognises as that child", () => {
    for (const group of NAV_TREE) {
      for (const child of group.children ?? []) {
        const [path = "/", query = ""] = child.href.split("?");
        expect(matchNav(path, qs(query)), `${child.href} should light ${child.id}`).toEqual({ groupId: group.id, childId: child.id });
      }
    }
  });
});

describe("pageHeading", () => {
  /** What the top bar prints: the name, and the part of the section when the page below does not say it. */
  const named = (path: string, query = "") => {
    const heading = pageHeading(path, qs(query));
    return heading ? [heading.label, heading.detail] : null;
  };

  it("names a page as the rail names it, with the rail's own icon", () => {
    expect(pageHeading("/", qs())).toEqual({ label: "Dashboard", detail: null, icon: LayoutDashboard });
    expect(pageHeading("/meetings", qs())).toEqual({ label: "Meetings", detail: null, icon: Handshake });
    expect(pageHeading("/reports", qs("fy=2025"))).toEqual({ label: "Reports", detail: null, icon: BarChart3 });
    expect(named("/activity", "scope=open")).toEqual(["Activity", null]);
    expect(named("/documents", "doc=doc_1")).toEqual(["Documents", null]);
  });

  it("adds the layout when Meetings is drawn as a board or a calendar, but not the scope its tabs already show", () => {
    expect(named("/meetings", "layout=board")).toEqual(["Meetings", "Board"]);
    expect(named("/meetings", "view=completed&layout=calendar")).toEqual(["Meetings", "Calendar"]);
    expect(named("/meetings", "view=upcoming")).toEqual(["Meetings", null]);
    expect(named("/meetings", "view=on_hold")).toEqual(["Meetings", null]);
  });

  it("keeps a record under Meetings, and says so when the page is the intake form", () => {
    expect(named("/meetings/mtg_1")).toEqual(["Meetings", null]);
    expect(named("/meetings/mtg_1/agenda")).toEqual(["Meetings", null]);
    expect(named("/meetings/new")).toEqual(["Meetings", "New meeting"]);
  });

  it("names the place inside People & places when the page has no tabs of its own to say it", () => {
    expect(pageHeading("/directory", qs())).toEqual({ label: "People & places", detail: null, icon: BookUser });
    expect(named("/directory", "tab=organizations")).toEqual(["People & places", null]);
    expect(named("/directory/staff/stf_ana")).toEqual(["People & places", "Experts"]);
    expect(named("/directory/organizations/artci")).toEqual(["People & places", "Organizations"]);
    expect(named("/countries")).toEqual(["People & places", "Countries"]);
    expect(named("/countries/KE")).toEqual(["People & places", "Countries"]);
  });

  it("names the brief under Reports, and the search page the rail does not lead to", () => {
    expect(named("/reports/brief", "fy=2026")).toEqual(["Reports", "Executive brief"]);
    expect(pageHeading("/search", qs("q=artci"))).toEqual({ label: "Search", detail: null, icon: Search });
  });

  it("says nothing on a page it cannot name", () => {
    expect(pageHeading("/forbidden", qs())).toBeNull();
    expect(pageHeading("/meetings-archive", null)).toBeNull();
  });
});

describe("open and closed groups", () => {
  it("opens every group until the reader says otherwise", () => {
    const state: NavOpenState = {};
    expect(groupIsOpen(state, "meetings")).toBe(true);
    expect(groupIsOpen({ meetings: false }, "meetings")).toBe(false);
    expect(groupIsOpen({ meetings: false }, "people")).toBe(true);
  });

  it("reads what it wrote, and shrugs off anything else in storage", () => {
    expect(parseNavOpen(serializeNavOpen({ meetings: false }))).toEqual({ meetings: false });
    expect(parseNavOpen(null)).toEqual({});
    expect(parseNavOpen("not json")).toEqual({});
    expect(parseNavOpen("[1,2]")).toEqual({});
    expect(parseNavOpen('{"meetings":"no","people":true}')).toEqual({ people: true });
  });
});
