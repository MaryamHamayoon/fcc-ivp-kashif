// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddExpertDialog } from "@/components/meetings/record/AddExpertDialog";
import type { AddressBookEntry } from "@/lib/integrations/address-book";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meetings/mtg_artci/people",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

afterEach(cleanup);

const results: AddressBookEntry[] = [
  { id: "stf_dana", name: "Dana Whitfield", email: "dana.whitfield@fcc.gov", title: "Spectrum Policy Analyst", bureauCode: "OEA", bureauName: "Office of Economics and Analytics", phone: null },
  { id: "stf_tomas", name: "Tomas Lindqvist", email: "tomas.lindqvist@fcc.gov", title: "Electronics Engineer", bureauCode: "SB", bureauName: "Space Bureau", phone: null },
];

const bureaus = [
  { code: "OEA", name: "Office of Economics and Analytics" },
  { code: "SB", name: "Space Bureau" },
];

describe("address-book dialog accessibility", () => {
  it("the results list carries no WCAG violations once people are found", async () => {
    render(
      <AddExpertDialog
        meetingId="mtg_artci"
        assignedStaffIds={["stf_tomas"]}
        bureaus={bureaus}
        addExpert={vi.fn(async () => ({ ok: true as const, id: "mex_new" }))}
        searchAddressBook={vi.fn(async () => ({ ok: true as const, entries: results }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add expert/ }));
    fireEvent.change(await screen.findByLabelText(/Search/i), { target: { value: "whit" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Dana Whitfield/ })).toBeInTheDocument());

    // Selecting a person must not change what the markup claims about itself.
    fireEvent.click(screen.getByRole("button", { name: /Dana Whitfield/ }));
    await expectNoViolations(document.body);
  });
});
