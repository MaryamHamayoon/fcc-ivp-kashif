// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const HITS = [
  { kind: "meeting", id: "mtg_1", title: "ARTCI delegation — spectrum roadmap", subtitle: "IVP-2026-012 · Côte d'Ivoire · Confirmed", href: "/meetings/mtg_1", score: 3, countryCode: "CI", status: "confirmed" },
  { kind: "organization", id: "org_artci", title: "ARTCI", subtitle: "Regulator · Côte d'Ivoire", href: "/directory/organizations/org_artci", score: 2.5, countryCode: "CI" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: HITS }), { status: 200, headers: { "content-type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("command palette accessibility", () => {
  it("carries no WCAG violations, empty or showing results", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CommandPalette canReadReports currentFy={2026} />
      </QueryClientProvider>,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: /search/i });
    // The palette is portalled out of the render container, so scan the whole document.
    await expectNoViolations(document.body);

    fireEvent.change(input, { target: { value: "artci" } });
    await waitFor(() => expect(screen.getByText("ARTCI delegation — spectrum roadmap")).toBeInTheDocument());
    await expectNoViolations(document.body);
  });
});
