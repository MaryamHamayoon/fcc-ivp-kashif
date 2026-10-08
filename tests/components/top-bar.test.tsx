// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NavCounts } from "@/components/shell/nav";
import { __resetNavOpenCache } from "@/components/shell/NavTree";
import { TopBar } from "@/components/shell/TopBar";
import { ThemeProvider } from "@/components/theme-provider";
import type { SessionUser } from "@/lib/auth/session";
import { OPEN_PREFERENCES_EVENT } from "@/lib/preferences/open";
import { OPEN_SEARCH_EVENT } from "@/components/shell/SearchButton";

/** Where the bar thinks it is; a test moves it before rendering. */
const route = vi.hoisted(() => ({ path: "/meetings", query: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(route.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// The account block in the sheet imports the sign-out server action, which drags the database in.
vi.mock("@/app/(auth)/login/actions", () => ({ signOut: vi.fn() }));

const user: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya.raman@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const counts: NavCounts = { attention: 2, active: 24, upcoming: 9 };

const renderBar = (canCreate = true) =>
  render(
    <ThemeProvider>
      <TopBar user={user} canCreate={canCreate} counts={counts} />
    </ThemeProvider>,
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  __resetNavOpenCache();
  route.path = "/meetings";
  route.query = "";
});

describe("top bar", () => {
  it("leads with the page's name, as the rail names it", () => {
    renderBar();
    const name = screen.getByTestId("page-name");
    expect(name).toHaveTextContent("Meetings");
    // The rail's icon for the section stands before the name; it is decoration, not content.
    expect(name.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("adds the part of the section the page below does not name for itself", () => {
    route.query = "layout=board";
    const view = renderBar();
    expect(screen.getByTestId("page-name")).toHaveTextContent(/^Meetings\s*Board$/);
    view.unmount();

    route.path = "/countries/KE";
    route.query = "";
    renderBar();
    expect(screen.getByTestId("page-name")).toHaveTextContent(/^People & places\s*Countries$/);
  });

  it("says nothing on a page it cannot name", () => {
    route.path = "/forbidden";
    renderBar();
    expect(screen.queryByTestId("page-name")).toBeNull();
  });

  it("keeps the search on the right, directly before New meeting", () => {
    renderBar();
    const name = screen.getByTestId("page-name");
    const field = screen.getByText("Search meetings, people, countries").closest("button")!;
    const intake = screen.getByRole("link", { name: "New meeting" });
    expect(name.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(intake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the search for what it searches and for the key that opens it", () => {
    renderBar();
    const field = screen.getByText("Search meetings, people, countries").closest("button");
    expect(field).not.toBeNull();
    expect(field).toHaveAttribute("aria-label", "Search");
    expect(field).toHaveAttribute("aria-keyshortcuts", expect.stringMatching(/^(Meta|Control)\+K$/));
  });

  it("opens the palette rather than taking a caret of its own", async () => {
    renderBar();
    const claimed = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener(OPEN_SEARCH_EVENT, claimed);
    await userEvent.click(screen.getAllByRole("button", { name: "Search" })[0]!);
    expect(claimed).toHaveBeenCalled();
    window.removeEventListener(OPEN_SEARCH_EVENT, claimed);
  });

  it("names the page without taking its heading: the h1 stays in the page, where the skip link lands", () => {
    renderBar();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("is the page's banner landmark, so everything in it — the page's name, search, New meeting — is reachable by landmark navigation", () => {
    renderBar();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByTestId("page-name")).toBeInTheDocument();
  });

  it("offers intake only to a role that may file one", () => {
    const view = renderBar(true);
    expect(screen.getByRole("link", { name: "New meeting" })).toHaveAttribute("href", "/meetings/new");
    view.unmount();
    renderBar(false);
    expect(screen.queryByRole("link", { name: "New meeting" })).toBeNull();
  });

  it("asks for the display panel rather than owning one", async () => {
    renderBar();
    const opened = vi.fn();
    window.addEventListener(OPEN_PREFERENCES_EVENT, opened);
    await userEvent.click(screen.getByRole("button", { name: "Display & accessibility" }));
    expect(opened).toHaveBeenCalled();
    window.removeEventListener(OPEN_PREFERENCES_EVENT, opened);
  });

  it("names the theme toggle by the theme it would move you to", async () => {
    renderBar();
    const toggle = await screen.findByRole("button", { name: "Switch to dark theme" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(await screen.findByRole("button", { name: "Switch to light theme" })).toHaveAttribute("aria-pressed", "true");
  });

  it("carries the phone's own navigation and the seal as the way home, which the rail owns on a desktop", async () => {
    renderBar();
    const home = screen.getByRole("link", { name: /international visitors program/i });
    expect(home).toHaveAttribute("href", "/");

    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });
});
