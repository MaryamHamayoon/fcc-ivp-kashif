// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryToolbar } from "@/components/documents/LibraryToolbar";
import { ReuseStrip } from "@/components/documents/ReuseStrip";
import { CLEAR_EVERYTHING, hasActiveFilters } from "@/components/documents/useLibraryQuery";
import { applyPatch, type ParamPatch } from "@/lib/url-state";
import { makeLibraryOptions } from "@/tests/fixtures/documents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents",
  useSearchParams: () => new URLSearchParams(),
}));

const setFilter = vi.fn();
const onClearAll = vi.fn();
const options = makeLibraryOptions();

const hrefFor = (params: URLSearchParams) => (patch: ParamPatch) => {
  const query = applyPatch(params, { ...patch, page: null, pageSize: null }).toString();
  return query ? `/documents?${query}` : "/documents";
};

function renderToolbar(query = "", total = 134, shown = total) {
  const params = new URLSearchParams(query);
  return render(<LibraryToolbar params={params} options={options} shown={shown} total={total} isLoading={false} hrefFor={hrefFor(params)} setFilter={setFilter} onClearAll={onClearAll} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryToolbar", () => {
  it("counts what is on the shelf against what matched", () => {
    renderToolbar("", 134, 50);
    expect(screen.getByRole("status")).toHaveTextContent("50 / 134 documents");
  });

  it("debounces typing into the URL's q", async () => {
    renderToolbar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), { target: { value: "  deck " } });
    expect(setFilter).not.toHaveBeenCalled();
    await waitFor(() => expect(setFilter).toHaveBeenCalledWith({ q: "deck" }));
  });

  it("cuts the shelf to what is starred for reuse, and back, as two scope tabs", () => {
    renderToolbar("topicId=spectrum-sharing");
    const shelf = within(screen.getByRole("navigation", { name: "Shelf" }));
    expect(shelf.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    expect(shelf.getByRole("link", { name: "Reuse-ready" })).toHaveAttribute("href", "/documents?topicId=spectrum-sharing&reusable=true");

    cleanup();
    renderToolbar("reusable=true&topicId=spectrum-sharing");
    const starred = within(screen.getByRole("navigation", { name: "Shelf" }));
    expect(starred.getByRole("link", { name: "Reuse-ready" })).toHaveAttribute("aria-current", "page");
    expect(starred.getByRole("link", { name: "All" })).toHaveAttribute("href", "/documents?topicId=spectrum-sharing");
  });

  it("treats the Reuse-ready shelf as scope: Reset keeps it, and on its own it is no filter at all", () => {
    expect(applyPatch(new URLSearchParams("reusable=true&topicId=spectrum-sharing&q=deck&sort=title"), CLEAR_EVERYTHING).toString()).toBe("reusable=true&sort=title");
    expect(hasActiveFilters(new URLSearchParams("reusable=true"))).toBe(false);
    expect(hasActiveFilters(new URLSearchParams("reusable=true&kind=briefing_deck"))).toBe(true);
  });

  it("filters by anything from one menu", async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.type(await screen.findByPlaceholderText("Filter by anything…"), "cable");
    await userEvent.click(await screen.findByRole("option", { name: /Submarine Cables/ }));
    expect(setFilter).toHaveBeenCalledWith({ topicId: "submarine-cables" });
  });

  it("shows every filter in force as a chip that removes only itself, and resets", () => {
    renderToolbar("kind=briefing_deck&topicId=spectrum-sharing&countryCode=CI&fy=2026&status=confirmed,clearance&orgId=artci");
    const chip = (name: RegExp) => screen.getByRole("button", { name });
    expect(chip(/^Type · Briefing Deck/)).toBeInTheDocument();
    expect(chip(/^Topic · Spectrum Sharing/)).toBeInTheDocument();
    expect(chip(/^Country · Côte d'Ivoire/)).toBeInTheDocument();
    expect(chip(/^Fiscal year · FY26/)).toBeInTheDocument();
    expect(chip(/^Meeting status · Confirmed/)).toBeInTheDocument();
    expect(chip(/^Organization · ARTCI/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("Filter 7 in force");

    fireEvent.click(chip(/^Type · Briefing Deck/));
    expect(setFilter).toHaveBeenCalledWith({ kind: null });
    fireEvent.click(chip(/^Meeting status · Confirmed/));
    expect(setFilter).toHaveBeenCalledWith({ status: ["clearance"] });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("offers the three sorts", async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: /^Sort/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Meeting date" }));
    expect(setFilter).toHaveBeenCalledWith({ sort: "meeting" });
  });
});

describe("ReuseStrip", () => {
  it("is absent until something is starred", () => {
    const { container } = render(<ReuseStrip topics={[]} total={0} params={new URLSearchParams()} setFilter={setFilter} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("narrows the Reuse-ready shelf to one topic, shows which chip is in force, and lets the topic go without leaving the shelf", () => {
    const view = render(<ReuseStrip topics={options.reusableTopics} total={options.reusableTotal} params={new URLSearchParams()} setFilter={setFilter} />);
    expect(screen.getByText("Reuse-ready")).toBeInTheDocument();
    expect(screen.getByText(String(options.reusableTotal))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Spectrum Sharing/ }));
    expect(setFilter).toHaveBeenCalledWith({ reusable: "true", topicId: "spectrum-sharing" });

    view.rerender(<ReuseStrip topics={options.reusableTopics} total={options.reusableTotal} params={new URLSearchParams("reusable=true&topicId=spectrum-sharing")} setFilter={setFilter} />);
    expect(screen.getByRole("button", { name: /Spectrum Sharing/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Spectrum Sharing/ }));
    expect(setFilter).toHaveBeenLastCalledWith({ topicId: null });
  });
});
