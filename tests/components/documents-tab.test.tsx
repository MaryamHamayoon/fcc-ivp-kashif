// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DocumentsTab } from "@/components/meetings/record/DocumentsTab";
import type { UploadRecordAction } from "@/components/meetings/record/tab-actions";
import { MAX_UPLOAD_BYTES } from "@/lib/domain/documents";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from "@/lib/domain/types";
import type { MeetingRecord } from "@/lib/services/record";
import { makeLibraryItem } from "@/tests/fixtures/documents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meetings/mtg_artci/documents",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const MEETING_ID = "mtg_artci";
type DocumentEntry = MeetingRecord["documents"][number];

const priya = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "regional_lead" as const, staffId: null, bureauCode: null, regionIds: ["af"], blurb: null, active: true, createdAt: new Date("2026-01-01T00:00:00Z") };

/** Metadata only — recorded before uploads existed. */
const agenda: DocumentEntry = {
  id: "doc_agenda",
  meetingId: MEETING_ID,
  kind: "agenda_final",
  title: "Final agenda — ARTCI study visit",
  storageKey: null,
  version: 2,
  reusable: false,
  addedById: priya.id,
  addedAt: new Date("2026-08-18T13:00:00Z"),
  filename: null,
  mime: null,
  size: null,
  sha256: null,
  sourceDocumentId: null,
  addedBy: priya,
};

/** A real upload. */
const deck: DocumentEntry = { ...agenda, id: "doc_deck", kind: "briefing_deck", title: "Spectrum sharing — FCC briefing deck", storageKey: "blob://abc123", filename: "spectrum-sharing-fcc-briefing-deck.pdf", mime: "application/pdf", size: 184_320, version: 1 };

/** A file that lives in SharePoint. */
const memo: DocumentEntry = { ...agenda, id: "doc_memo", kind: "other", title: "Clearance memo", storageKey: "https://fcc.sharepoint.com/sites/oia/memo.docx", version: 1 };

const ok = async () => ({ ok: true as const });

function renderTab(over: { documents?: DocumentEntry[]; canAdd?: boolean } = {}) {
  const props = {
    meetingId: MEETING_ID,
    documents: over.documents ?? [agenda],
    canAdd: over.canAdd ?? true,
    addDocument: vi.fn(async () => ({ ok: true as const, id: "doc_new" })),
    uploadDocument: vi.fn<UploadRecordAction>(async () => ({ ok: true, id: "doc_new", version: 1 })),
    reuseDocument: vi.fn(async () => ({ ok: true as const, id: "doc_new", code: "IVP-2026-050", version: 1 })),
    toggleReusable: vi.fn(ok),
    removeDocument: vi.fn(ok),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (documents: DocumentEntry[]) => (
    <QueryClientProvider client={client}>
      <DocumentsTab {...props} documents={documents} />
    </QueryClientProvider>
  );
  const view = render(tree(props.documents));
  return { ...props, rerender: (documents: DocumentEntry[]) => view.rerender(tree(documents)) };
}

const slot = (kind: keyof typeof DOCUMENT_KIND_LABELS) => screen.getByRole("group", { name: new RegExp(DOCUMENT_KIND_LABELS[kind]) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DocumentsTab", () => {
  it("lays out one slot for each of the eight document kinds", () => {
    renderTab();
    expect(screen.getAllByRole("group")).toHaveLength(DOCUMENT_KINDS.length);
    for (const kind of DOCUMENT_KINDS) expect(screen.getByRole("heading", { name: new RegExp(DOCUMENT_KIND_LABELS[kind]) })).toBeInTheDocument();
  });

  it("shows what is on file and what is still missing", () => {
    renderTab();
    expect(within(slot("agenda_final")).getByText("Final agenda — ARTCI study visit")).toBeInTheDocument();
    expect(within(slot("agenda_final")).getByText(/v2/)).toBeInTheDocument();
    expect(within(slot("briefing_deck")).getByText(/Drop a file here/i)).toBeInTheDocument();
  });

  it("offers a drop target with browse and link in every slot, and no longer promises uploads later", () => {
    renderTab();
    expect(screen.queryByText(/Uploads arrive in Phase 2/i)).not.toBeInTheDocument();
    for (const kind of DOCUMENT_KINDS) {
      expect(within(slot(kind)).getByRole("button", { name: "browse" })).toBeInTheDocument();
      expect(within(slot(kind)).getByRole("button", { name: "link one that already exists" })).toBeInTheDocument();
    }
  });

  it("uploads a chosen file into its slot, as a form the action can read", async () => {
    const view = renderTab();
    const file = new File(["%PDF-1.4 deck"], "deck.pdf", { type: "application/pdf" });
    fireEvent.change(within(slot("briefing_deck")).getByLabelText("Upload Briefing Deck"), { target: { files: [file] } });

    await waitFor(() => expect(view.uploadDocument).toHaveBeenCalledTimes(1));
    const form = view.uploadDocument.mock.calls[0]![0];
    expect(form.get("meetingId")).toBe(MEETING_ID);
    expect(form.get("kind")).toBe("briefing_deck");
    expect(form.get("file")).toBe(file);
  });

  it("refuses a file over 4 MB inside the slot, without sending it", () => {
    const view = renderTab();
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf", { type: "application/pdf" });
    fireEvent.change(within(slot("briefing_deck")).getByLabelText("Upload Briefing Deck"), { target: { files: [big] } });
    expect(within(slot("briefing_deck")).getByRole("alert")).toHaveTextContent(/Over 4 MB/);
    expect(view.uploadDocument).not.toHaveBeenCalled();
  });

  it("refuses a type that is not on the list and says what is", () => {
    const view = renderTab();
    const exe = new File(["MZ"], "setup.exe", { type: "application/x-msdownload" });
    fireEvent.change(within(slot("work_plan")).getByLabelText("Upload Work Plan"), { target: { files: [exe] } });
    expect(within(slot("work_plan")).getByRole("alert")).toHaveTextContent(/PDF, Word, PowerPoint, Excel, images, text/);
    expect(view.uploadDocument).not.toHaveBeenCalled();
  });

  it("offers Open and Download for a stored file, Open alone for bare metadata, and the address for a link", () => {
    renderTab({ documents: [agenda, deck, memo] });
    const deckRow = within(slot("briefing_deck"));
    expect(deckRow.getByRole("button", { name: /^Open/ })).toBeInTheDocument();
    expect(deckRow.getByRole("link", { name: /^Download/ })).toHaveAttribute("href", "/api/documents/doc_deck/file?download=1");

    const agendaRow = within(slot("agenda_final"));
    expect(agendaRow.getByRole("button", { name: /^Open/ })).toBeInTheDocument();
    expect(agendaRow.queryByRole("link", { name: /^Download/ })).toBeNull();

    const memoRow = within(slot("other"));
    expect(memoRow.getByRole("link", { name: "fcc.sharepoint.com" })).toHaveAttribute("href", "https://fcc.sharepoint.com/sites/oia/memo.docx");
    expect(memoRow.queryByRole("link", { name: /^Download/ })).toBeNull();
  });

  it("opens a document in the drawer", async () => {
    const item = makeLibraryItem({ id: "doc_deck", storageScheme: "blob" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ item, versions: [item], source: null }), { status: 200, headers: { "content-type": "application/json" } })));
    renderTab({ documents: [deck] });
    fireEvent.click(within(slot("briefing_deck")).getByRole("button", { name: /^Open/ }));
    const dialog = await screen.findByRole("dialog", { name: "Spectrum sharing — FCC briefing deck" });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe("/api/documents/doc_deck");
    expect(within(dialog).getByTitle(/^Preview of/)).toBeInTheDocument();
  });

  it("records a link to a file that lives elsewhere, and marks the slot present", async () => {
    const view = renderTab();

    fireEvent.click(within(slot("work_plan")).getByRole("button", { name: "link one that already exists" }));
    fireEvent.change(within(slot("work_plan")).getByLabelText(/Title/), { target: { value: "Work plan v1 — ARTCI" } });
    fireEvent.change(within(slot("work_plan")).getByLabelText(/Link/), { target: { value: "https://fcc.sharepoint.com/sites/oia/work-plan.docx" } });
    fireEvent.click(within(slot("work_plan")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(view.addDocument).toHaveBeenCalledWith({ meetingId: MEETING_ID, kind: "work_plan", title: "Work plan v1 — ARTCI", reusable: false, storageKey: "https://fcc.sharepoint.com/sites/oia/work-plan.docx" }));

    view.rerender([agenda, { ...agenda, id: "doc_plan", kind: "work_plan", title: "Work plan v1 — ARTCI", version: 1, storageKey: "https://fcc.sharepoint.com/sites/oia/work-plan.docx" }]);
    expect(within(slot("work_plan")).getByText("Work plan v1 — ARTCI")).toBeInTheDocument();
    expect(within(slot("work_plan")).queryByText(/Drop a file here/i)).not.toBeInTheDocument();
  });

  it("insists a link be a full address, and lets metadata alone through", async () => {
    const view = renderTab();
    fireEvent.click(within(slot("work_plan")).getByRole("button", { name: "link one that already exists" }));
    fireEvent.change(within(slot("work_plan")).getByLabelText(/Title/), { target: { value: "Work plan v1 — ARTCI" } });
    fireEvent.change(within(slot("work_plan")).getByLabelText(/Link/), { target: { value: "sites/oia/work-plan.docx" } });
    fireEvent.click(within(slot("work_plan")).getByRole("button", { name: "Save" }));
    expect(within(slot("work_plan")).getByText(/full address/i)).toBeInTheDocument();
    expect(view.addDocument).not.toHaveBeenCalled();

    fireEvent.change(within(slot("work_plan")).getByLabelText(/Link/), { target: { value: "" } });
    fireEvent.click(within(slot("work_plan")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(view.addDocument).toHaveBeenCalledWith({ meetingId: MEETING_ID, kind: "work_plan", title: "Work plan v1 — ARTCI", reusable: false }));
  });

  it("stars a document as reusable, and unstars it again", async () => {
    const view = renderTab();

    fireEvent.click(screen.getByRole("button", { name: /Mark Final agenda — ARTCI study visit as reusable/ }));
    await waitFor(() => expect(view.toggleReusable).toHaveBeenCalledWith({ meetingId: MEETING_ID, id: "doc_agenda", reusable: true }));

    view.rerender([{ ...agenda, reusable: true }]);
    fireEvent.click(screen.getByRole("button", { name: /no longer reusable/ }));
    await waitFor(() => expect(view.toggleReusable).toHaveBeenLastCalledWith({ meetingId: MEETING_ID, id: "doc_agenda", reusable: false }));
  });

  it("gives a reader the shelf without the controls", () => {
    renderTab({ canAdd: false, documents: [agenda, deck] });
    expect(screen.queryByRole("button", { name: "browse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reusable/ })).not.toBeInTheDocument();
    expect(within(slot("agenda_final")).getByText("Final agenda — ARTCI study visit")).toBeInTheDocument();
    expect(within(slot("briefing_deck")).getByRole("link", { name: /^Download/ })).toBeInTheDocument();
    expect(within(slot("work_plan")).getByText(/Nothing on file/i)).toBeInTheDocument();
  });
});
