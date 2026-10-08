// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { LibraryTable } from "@/components/documents/LibraryTable";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { makeLibraryItem } from "@/tests/fixtures/documents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
  useSearchParams: () => new URLSearchParams(),
}));

/** Starred deck, first version, a real file. */
const deck = makeLibraryItem();

/** The second version of a final agenda — the current one. */
const agenda = makeLibraryItem({
  id: "doc_agenda_v2",
  kind: "agenda_final",
  kindLabel: "Final Agenda",
  title: "Final agenda — ARTCI study visit",
  filename: "final-agenda-artci-study-visit.pdf",
  version: 2,
  reusable: false,
  addedByName: "Marcus Bell",
  addedAt: new Date("2026-08-22T09:15:00Z"),
});

/** A deck that travelled here from an earlier meeting. */
const reused = makeLibraryItem({
  id: "doc_reused",
  meetingId: "mtg_kenya",
  meetingCode: "IVP-2026-050",
  meetingTitle: "CA Kenya spectrum sharing exchange",
  countryCode: "KE",
  countryName: "Kenya",
  orgName: "Communications Authority of Kenya",
  orgShortName: "CA",
  reusable: false,
  sourceDocumentId: "doc_artci_deck",
  sourceMeetingCode: "IVP-2026-041",
  sourceMeetingId: "mtg_artci",
});

/** Metadata only: the file lives in SharePoint. */
const link = makeLibraryItem({
  id: "doc_link",
  kind: "other",
  kindLabel: "Other",
  title: "Clearance memo (SharePoint)",
  filename: null,
  mime: null,
  size: null,
  reusable: false,
  preview: null,
  storageScheme: "link",
});

const items: DocumentLibraryItem[] = [deck, agenda, reused, link];

const handlers = {
  onOpen: vi.fn(),
  onReuse: vi.fn(),
  onToggleStar: vi.fn(),
  onRemove: vi.fn(),
  onClearFilters: vi.fn(),
};

function renderTable(props: Partial<ComponentProps<typeof LibraryTable>> = {}) {
  return render(<LibraryTable items={items} total={items.length} canManage={() => true} {...handlers} {...props} />);
}

const rows = () => within(screen.getByRole("rowgroup", { name: "Documents" })).getAllByRole("row");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryTable", () => {
  it("renders one row per document with its slot, meeting, version and provenance", () => {
    renderTable();
    expect(rows()).toHaveLength(4);

    const first = rows()[0]!;
    expect(within(first).getByRole("button", { name: "Spectrum sharing — FCC briefing deck" })).toBeInTheDocument();
    expect(within(first).getByText("Briefing Deck")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: /IVP-2026-041/ })).toHaveAttribute("href", "/meetings/mtg_artci");
    expect(within(first).getByText(/Côte d'Ivoire/)).toBeInTheDocument();
    expect(within(first).getByText(/Priya Raman/)).toBeInTheDocument();
    expect(within(first).getByText("Reusable")).toBeInTheDocument();

    expect(within(rows()[1]!).getByText("v2")).toBeInTheDocument();
    expect(within(rows()[2]!).getByText(/Reused from IVP-2026-041/)).toBeInTheDocument();
    expect(within(rows()[3]!).getByText("Link")).toBeInTheDocument();
  });

  it("opens a document from its title, and from a click anywhere else on the row", () => {
    renderTable();
    fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Spectrum sharing — FCC briefing deck" }));
    expect(handlers.onOpen).toHaveBeenLastCalledWith("doc_artci_deck", expect.any(HTMLElement));

    fireEvent.click(within(rows()[1]!).getByText("Final Agenda"));
    expect(handlers.onOpen).toHaveBeenLastCalledWith("doc_agenda_v2", expect.any(HTMLElement));
    expect(handlers.onOpen).toHaveBeenCalledTimes(2);
  });

  it("leaves a click on the meeting link to the link", () => {
    renderTable();
    fireEvent.click(within(rows()[0]!).getByRole("link", { name: /IVP-2026-041/ }));
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it("offers every action to someone who may manage the shelf, and only the reading ones to everyone else", async () => {
    const view = renderTable();
    await userEvent.click(within(rows()[0]!).getByRole("button", { name: /Actions for Spectrum sharing — FCC briefing deck/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual(["Open", "Download", "View meeting", "Reuse in a meeting…", "Unstar", "Remove"]);

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Reuse in a meeting…" }));
    expect(handlers.onReuse).toHaveBeenCalledWith(deck);

    view.rerender(<LibraryTable items={items} total={items.length} canManage={() => false} {...handlers} />);
    await userEvent.click(within(rows()[3]!).getByRole("button", { name: /Actions for Clearance memo/ }));
    const readOnly = await screen.findByRole("menu");
    // A SharePoint link has nothing to download; a reader has nothing to change.
    expect(within(readOnly).getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual(["Open", "View meeting"]);
  });

  it("stars and removes through the menu", async () => {
    renderTable();
    await userEvent.click(within(rows()[1]!).getByRole("button", { name: /Actions for Final agenda/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Star" }));
    expect(handlers.onToggleStar).toHaveBeenCalledWith(agenda);

    await userEvent.click(within(rows()[1]!).getByRole("button", { name: /Actions for Final agenda/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(handlers.onRemove).toHaveBeenCalledWith(agenda);
  });

  it("says plainly when nothing matches, and offers to clear the filters", () => {
    renderTable({ items: [], total: 0, hasFilters: true });
    expect(screen.getByText("Nothing on file matches.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(handlers.onClearFilters).toHaveBeenCalled();
  });

  it("marks itself busy while loading and shows how many more there are", () => {
    const view = renderTable({ items: [], total: 0, isLoading: true });
    expect(screen.getByRole("region", { name: "Documents" })).toHaveAttribute("aria-busy", "true");
    view.rerender(<LibraryTable items={items} total={120} canManage={() => true} canLoadMore onLoadMore={vi.fn()} {...handlers} />);
    expect(screen.getByText("4 of 120 loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });
});
