// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { toast } from "sonner";
import { type ReuseAction, ReuseDialog } from "@/components/documents/ReuseDialog";
import { makeLibraryItem } from "@/tests/fixtures/documents";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Only what the picker reads; the API sends far more and the schema strips it. */
const PICKS = [
  { id: "mtg_kenya", code: "IVP-2026-050", title: "CA Kenya spectrum sharing exchange", status: "confirmed", countryCode: "KE", countryName: "Kenya", orgName: "Communications Authority of Kenya", orgShortName: "CA", scheduledStart: "2026-10-06T14:00:00Z" },
  { id: "mtg_artci", code: "IVP-2026-041", title: "Spectrum sharing study visit", status: "confirmed", countryCode: "CI", countryName: "Côte d'Ivoire", orgName: "ARTCI", orgShortName: "ARTCI", scheduledStart: "2026-09-15T14:00:00Z" },
  { id: "mtg_ofcom", code: "IVP-2026-062", title: "Ofcom spectrum sharing roundtable", status: "developing", countryCode: "GB", countryName: "United Kingdom", orgName: "Ofcom", orgShortName: "Ofcom", scheduledStart: null },
];

const source = makeLibraryItem();
const reuse = vi.fn<ReuseAction>();
const onOpenChange = vi.fn();
const onDone = vi.fn();

function renderDialog(over: Partial<ComponentProps<typeof ReuseDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReuseDialog source={source} onOpenChange={onOpenChange} onDone={onDone} reuse={reuse} {...over} />
    </QueryClientProvider>,
  );
}

const requestedQueries = () => vi.mocked(fetch).mock.calls.map((call) => new URL(String(call[0]), "http://localhost").searchParams.get("q") ?? "");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.pathname).toBe("/api/meetings");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = PICKS.filter((m) => !q || `${m.countryName} ${m.orgName} ${m.title} ${m.code}`.toLowerCase().includes(q));
      return new Response(JSON.stringify({ items, total: items.length, page: 1, pageSize: 10 }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReuseDialog", () => {
  it("is closed without a source", () => {
    renderDialog({ source: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers active meetings at once, leaving the source's own meeting out", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Reuse in a meeting" });
    const list = await within(dialog).findByRole("list", { name: "Meetings" });
    const names = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");
    expect(names.some((name) => name.includes("IVP-2026-050"))).toBe(true);
    expect(names.some((name) => name.includes("IVP-2026-062"))).toBe(true);
    expect(names.some((name) => name.includes("IVP-2026-041"))).toBe(false);
  });

  it("searches as you type, defaults the slot to the source's kind, and places the file", async () => {
    reuse.mockResolvedValue({ ok: true, id: "doc_new", code: "IVP-2026-050", version: 1 });
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Reuse in a meeting" });
    expect(within(dialog).getByRole("combobox", { name: "Slot" })).toHaveValue("briefing_deck");
    expect(within(dialog).getByRole("button", { name: /^Place/ })).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search meetings" }), { target: { value: "kenya" } });
    await waitFor(() => expect(requestedQueries()).toContain("kenya"));
    const option = await within(dialog).findByRole("button", { name: /IVP-2026-050/ });
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /IVP-2026-062/ })).toBeNull());
    fireEvent.click(option);
    expect(option).toHaveAttribute("aria-pressed", "true");

    const confirm = within(dialog).getByRole("button", { name: "Place in IVP-2026-050" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(reuse).toHaveBeenCalledWith({ sourceId: "doc_artci_deck", meetingId: "mtg_kenya", kind: "briefing_deck" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ id: "doc_new", code: "IVP-2026-050", version: 1, kind: "briefing_deck" }));
    expect(toast.success).toHaveBeenCalledWith("Placed in IVP-2026-050 as Briefing Deck v1");
  });

  it("lets the slot be changed before placing", async () => {
    reuse.mockResolvedValue({ ok: true, id: "doc_new", code: "IVP-2026-062", version: 2 });
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /IVP-2026-062/ }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Slot" }), { target: { value: "other" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place in IVP-2026-062" }));
    await waitFor(() => expect(reuse).toHaveBeenCalledWith({ sourceId: "doc_artci_deck", meetingId: "mtg_ofcom", kind: "other" }));
    expect(toast.success).toHaveBeenCalledWith("Placed in IVP-2026-062 as Other v2");
  });

  it("keeps the reason on screen when placing fails", async () => {
    reuse.mockResolvedValue({ ok: false, error: "That file is already on IVP-2026-050." });
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /IVP-2026-050/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Place in IVP-2026-050" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That file is already on IVP-2026-050.");
    expect(onDone).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
