// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DocumentDrawer } from "@/components/documents/DocumentDrawer";
import { LibraryTable } from "@/components/documents/LibraryTable";
import { LibraryToolbar } from "@/components/documents/LibraryToolbar";
import { ReuseDialog } from "@/components/documents/ReuseDialog";
import { ReuseStrip } from "@/components/documents/ReuseStrip";
import { makeLibraryItem, makeLibraryOptions } from "@/tests/fixtures/documents";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const options = makeLibraryOptions();
const items = [
  makeLibraryItem(),
  makeLibraryItem({ id: "doc_v2", kind: "agenda_final", kindLabel: "Final Agenda", title: "Final agenda", version: 2, reusable: false }),
  makeLibraryItem({ id: "doc_reused", reusable: false, sourceDocumentId: "doc_artci_deck", sourceMeetingCode: "IVP-2026-018", sourceMeetingId: "mtg_x" }),
  makeLibraryItem({ id: "doc_link", kind: "other", kindLabel: "Other", title: "Memo", filename: null, mime: null, size: null, preview: null, storageScheme: "link", reusable: false }),
];

describe("document library accessibility", () => {
  it("the toolbar and its chips carry no WCAG violations", async () => {
    const { container } = render(<LibraryToolbar params={new URLSearchParams("kind=briefing_deck&reusable=true&status=confirmed")} options={options} shown={12} total={12} isLoading={false} hrefFor={() => "/documents"} setFilter={vi.fn()} onClearAll={vi.fn()} />);
    await expectNoViolations(container);
  });

  it("the reuse strip carries no WCAG violations", async () => {
    const { container } = render(<ReuseStrip topics={options.reusableTopics} total={options.reusableTotal} params={new URLSearchParams("reusable=true&topicId=spectrum-sharing")} setFilter={vi.fn()} />);
    await expectNoViolations(container);
  });

  it("the table carries no WCAG violations, populated, empty and loading", async () => {
    const handlers = { onOpen: vi.fn(), onReuse: vi.fn(), onToggleStar: vi.fn(), onRemove: vi.fn(), onClearFilters: vi.fn() };
    const { container, rerender } = render(<LibraryTable items={items} total={items.length} canManage={() => true} canLoadMore onLoadMore={vi.fn()} {...handlers} />);
    await expectNoViolations(container);
    rerender(<LibraryTable items={[]} total={0} hasFilters canManage={() => true} {...handlers} />);
    await expectNoViolations(container);
    rerender(<LibraryTable items={[]} total={0} isLoading canManage={() => true} {...handlers} />);
    await expectNoViolations(container);
  });

  it("the drawer, open on a versioned document with provenance, carries no WCAG violations", async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const older = makeLibraryItem({ ...items[2]!, id: "doc_reused_v1", version: 1, isCurrent: false });
    vi.stubGlobal("fetch", vi.fn(async () => json({ item: { ...items[2]!, version: 2 }, versions: [{ ...items[2]!, version: 2 }, older], source: items[0]! })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DocumentDrawer documentId="doc_reused" onClose={vi.fn()} onReuse={vi.fn()} onToggleStar={vi.fn()} canManage={() => true} hrefFor={(id) => `/documents?doc=${id}`} />
      </QueryClientProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("list", { name: "Versions" });
    await expectNoViolations(dialog);
  });

  it("the reuse dialog, with results and a chosen meeting, carries no WCAG violations", async () => {
    const picks = [{ id: "mtg_kenya", code: "IVP-2026-050", title: "CA Kenya spectrum sharing exchange", status: "confirmed", countryCode: "KE", countryName: "Kenya", orgName: "Communications Authority of Kenya", orgShortName: "CA", scheduledStart: "2026-10-06T14:00:00Z" }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: picks }), { status: 200, headers: { "content-type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReuseDialog source={items[0]!} onOpenChange={vi.fn()} onDone={vi.fn()} reuse={vi.fn()} />
      </QueryClientProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    (await within(dialog).findByRole("button", { name: /IVP-2026-050/ })).click();
    await expectNoViolations(dialog);
  });
});
