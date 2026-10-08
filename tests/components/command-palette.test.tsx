// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { OPEN_SEARCH_EVENT } from "@/components/shell/SearchButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));

const HITS = [
  { kind: "meeting", id: "mtg_1", title: "ARTCI delegation — spectrum roadmap", subtitle: "IVP-2026-012 · Côte d’Ivoire · Confirmed", href: "/meetings/mtg_1", score: 3, countryCode: "CI", status: "confirmed" },
  { kind: "organization", id: "org_artci", title: "ARTCI", subtitle: "Regulator · Côte d’Ivoire", href: "/directory/organizations/org_artci", score: 2.5, countryCode: "CI" },
];

function renderPalette(props: Partial<ComponentProps<typeof CommandPalette>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette canReadReports currentFy={2026} {...props} />
    </QueryClientProvider>,
  );
}

const openPalette = async () => {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  return screen.findByRole("combobox", { name: /search/i });
};

beforeEach(() => {
  push.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: HITS }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("command palette", () => {
  // CommandDialog's sr-only title/description used to be a sibling of DialogContent, so it
  // rendered into the page — outside any landmark — even while the dialog was closed (axe:
  // region). It must exist only once the dialog itself is open.
  it("keeps the palette's hidden title out of the page until the dialog is open", () => {
    renderPalette();
    expect(document.querySelector('[data-slot="dialog-header"]')).toBeNull();
  });

  it("names the open dialog for the palette's title", async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("opens on Ctrl+K, searches the API as you type, and Enter opens the first hit", async () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: /search/i });
    fireEvent.change(input, { target: { value: "artci" } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("/api/search?q=artci");
    expect(await screen.findByText("ARTCI delegation — spectrum roadmap")).toBeInTheDocument();
    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/meetings/mtg_1"));
  });

  it("claims the top-bar event and links to the full results page", async () => {
    renderPalette();
    const event = new CustomEvent(OPEN_SEARCH_EVENT, { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const input = await screen.findByRole("combobox", { name: /search/i });
    fireEvent.change(input, { target: { value: "artci" } });
    const all = await screen.findByText(/see all results/i);
    fireEvent.click(all);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/search?q=artci"));
  });

  it("offers the library, the reports and the brief as actions before anything is typed, and runs them", async () => {
    const downloaded: (string | null)[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(this.getAttribute("href"));
    });
    renderPalette();

    await openPalette();
    fireEvent.click(screen.getByText("Open document library"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/documents"));

    await openPalette();
    fireEvent.click(screen.getByText("Open reports"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/reports"));

    await openPalette();
    fireEvent.click(screen.getByText("Download the executive brief"));
    await waitFor(() => expect(downloaded).toEqual(["/api/reports/brief?fy=2026"]));
    expect(screen.queryByRole("combobox", { name: /search/i })).toBeNull();
  });

  it("opens the program-wide activity log, for a reader without reports too", async () => {
    renderPalette({ canReadReports: false });
    await openPalette();
    fireEvent.click(screen.getByText("Open activity log"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/activity"));
  });

  it("opens Global reach, the full-screen map, for every reader, and finds it by the word map", async () => {
    renderPalette({ canReadReports: false });
    const input = await openPalette();
    fireEvent.change(input, { target: { value: "map" } });
    fireEvent.click(screen.getByText("Open Global reach"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/reach"));
  });

  it("keeps the reports actions from a reader the policy would refuse", async () => {
    renderPalette({ canReadReports: false });
    await openPalette();
    expect(screen.getByText("Open document library")).toBeInTheDocument();
    expect(screen.getByText("Display & accessibility")).toBeInTheDocument();
    expect(screen.queryByText("Open reports")).toBeNull();
    expect(screen.queryByText(/executive brief/i)).toBeNull();
  });
});
