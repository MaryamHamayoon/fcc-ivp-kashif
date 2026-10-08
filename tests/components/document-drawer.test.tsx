// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { DocumentDrawer } from "@/components/documents/DocumentDrawer";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { makeLibraryItem } from "@/tests/fixtures/documents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
  useSearchParams: () => new URLSearchParams(),
}));

const deck = makeLibraryItem();

const agendaFields: Partial<DocumentLibraryItem> = { kind: "agenda_final", kindLabel: "Final Agenda", title: "Final agenda — ARTCI study visit", reusable: false, addedByName: "Marcus Bell" };
const agendaV1 = makeLibraryItem({ ...agendaFields, id: "doc_agenda_v1", version: 1, isCurrent: false, addedAt: new Date("2026-08-15T09:00:00Z") });
const agendaV2 = makeLibraryItem({ ...agendaFields, id: "doc_agenda_v2", version: 2, isCurrent: true, addedAt: new Date("2026-08-22T09:15:00Z") });

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

const link = makeLibraryItem({
  id: "doc_link",
  kind: "other",
  kindLabel: "Other",
  title: "Clearance memo",
  filename: null,
  mime: null,
  size: null,
  reusable: false,
  preview: null,
  storageScheme: "link",
  link: "https://fcc.sharepoint.com/sites/oia/memo.docx",
});

const details: Record<string, { item: DocumentLibraryItem; versions: DocumentLibraryItem[]; source: DocumentLibraryItem | null }> = {
  doc_artci_deck: { item: deck, versions: [deck], source: null },
  doc_agenda_v2: { item: agendaV2, versions: [agendaV2, agendaV1], source: null },
  doc_reused: { item: reused, versions: [reused], source: deck },
  doc_link: { item: link, versions: [link], source: null },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const handlers = { onClose: vi.fn(), onReuse: vi.fn(), onToggleStar: vi.fn() };

function renderDrawer(documentId: string | null, over: Partial<ComponentProps<typeof DocumentDrawer>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DocumentDrawer documentId={documentId} canManage={() => true} hrefFor={(id) => `/documents?doc=${id}`} {...handlers} {...over} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const id = String(input).match(/\/api\/documents\/([^/?#]+)$/)?.[1];
      const detail = id ? details[id] : undefined;
      return detail ? json(detail) : json({ error: "That document could not be found." }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DocumentDrawer", () => {
  it("stays closed with nothing to show", () => {
    renderDrawer(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the document, its meeting, who added it, and a PDF preview with Download and View meeting", async () => {
    renderDrawer("doc_artci_deck");
    const dialog = await screen.findByRole("dialog", { name: "Spectrum sharing — FCC briefing deck" });
    expect(within(dialog).getByText("Briefing Deck")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /IVP-2026-041/ })).toHaveAttribute("href", "/meetings/mtg_artci");
    expect(within(dialog).getByText(/Priya Raman/)).toHaveTextContent(/PDF · 180 KB/);
    expect(within(dialog).getByTitle("Preview of Spectrum sharing — FCC briefing deck")).toHaveAttribute("src", "/api/documents/doc_artci_deck/file#toolbar=0&view=FitH");
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/documents/doc_artci_deck/file?download=1");
    expect(within(dialog).getByRole("link", { name: "View meeting" })).toHaveAttribute("href", "/meetings/mtg_artci");
    expect(within(dialog).queryByRole("list", { name: "Versions" })).toBeNull();
  });

  it("lists every version of the slot, newest first, and swaps the preview to an older one", async () => {
    renderDrawer("doc_agenda_v2");
    const dialog = await screen.findByRole("dialog", { name: "Final agenda — ARTCI study visit" });
    const rows = within(within(dialog).getByRole("list", { name: "Versions" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/v2/);
    expect(rows[0]).toHaveTextContent(/current/i);
    expect(rows[0]).toHaveTextContent(/Marcus Bell/);
    expect(rows[1]).toHaveTextContent(/v1/);
    expect(within(rows[0]!).getByRole("button")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(rows[1]!).getByRole("button"));
    expect(within(rows[1]!).getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByTitle(/^Preview of/)).toHaveAttribute("src", "/api/documents/doc_agenda_v1/file#toolbar=0&view=FitH");
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/documents/doc_agenda_v1/file?download=1");
  });

  it("names where a reused document came from and links to the original", async () => {
    renderDrawer("doc_reused");
    const dialog = await screen.findByRole("dialog", { name: "Spectrum sharing — FCC briefing deck" });
    expect(within(dialog).getByText(/Reused from IVP-2026-041/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Spectrum sharing — FCC briefing deck" })).toHaveAttribute("href", "/documents?doc=doc_artci_deck");
  });

  it("says plainly that a linked document lives elsewhere, and offers no download or reuse", async () => {
    renderDrawer("doc_link");
    const dialog = await screen.findByRole("dialog", { name: "Clearance memo" });
    expect(within(dialog).getByText(/kept outside the IVP platform/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Open in SharePoint/ })).toHaveAttribute("href", "https://fcc.sharepoint.com/sites/oia/memo.docx");
    expect(within(dialog).queryByRole("link", { name: "Download" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Reuse in a meeting/ })).toBeNull();
    expect(within(dialog).queryByTitle(/^Preview of/)).toBeNull();
  });

  it("stars and reuses from the footer, only for someone who may manage the shelf", async () => {
    renderDrawer("doc_artci_deck");
    const dialog = await screen.findByRole("dialog", { name: "Spectrum sharing — FCC briefing deck" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unstar" }));
    expect(handlers.onToggleStar).toHaveBeenCalledWith(expect.objectContaining({ id: "doc_artci_deck" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reuse in a meeting…" }));
    expect(handlers.onReuse).toHaveBeenCalledWith(expect.objectContaining({ id: "doc_artci_deck" }));

    cleanup();
    renderDrawer("doc_artci_deck", { canManage: () => false });
    const readOnly = await screen.findByRole("dialog", { name: "Spectrum sharing — FCC briefing deck" });
    expect(within(readOnly).queryByRole("button", { name: /^(Star|Unstar)$/ })).toBeNull();
    expect(within(readOnly).queryByRole("button", { name: /Reuse in a meeting/ })).toBeNull();
    expect(within(readOnly).getByRole("link", { name: "Download" })).toBeInTheDocument();
  });

  it("closes on Escape and says so", async () => {
    renderDrawer("doc_artci_deck");
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(handlers.onClose).toHaveBeenCalled());
  });

  it("says when a document cannot be found", async () => {
    renderDrawer("doc_nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("That document could not be found.");
  });
});
