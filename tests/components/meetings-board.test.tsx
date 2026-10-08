// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingsBoard } from "@/components/meetings/MeetingsBoard";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { FIXTURE_NOW, makeListItem, makeReadiness } from "@/tests/fixtures/meetings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: (...args: unknown[]) => toastSuccess(...args) } }));

/** A fresh request: nothing scheduled, nothing promised. */
const requested = makeListItem({
  id: "mtg_req",
  code: "IVP-2026-070",
  title: "Introductory call with the new commission",
  status: "requested",
  countryCode: "KE",
  countryName: "Kenya",
  countryCodes: ["KE"],
  orgName: "Communications Authority of Kenya",
  orgShortName: "CA Kenya",
  scheduledStart: null,
  scheduledEnd: null,
  candidateDates: [],
  readiness: makeReadiness({ status: "requested", hasAcceptedDate: false, experts: [], documents: [], namedParticipants: 0 }),
});

/** Under development with two dates on the table and nobody committed. */
const developing = makeListItem({
  id: "mtg_ofcom",
  code: "IVP-2026-052",
  title: "Broadband mapping exchange",
  status: "developing",
  countryCode: "GB",
  countryName: "United Kingdom",
  countryCodes: ["GB"],
  orgName: "Office of Communications",
  orgShortName: "Ofcom",
  scheduledStart: null,
  scheduledEnd: null,
  candidateDates: [
    { id: "cd_1", start: new Date("2026-09-02T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
    { id: "cd_2", start: new Date("2026-09-03T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
  ],
  readiness: makeReadiness({ status: "developing", hasAcceptedDate: false, experts: [{ status: "requested" }], documents: [], namedParticipants: 0 }),
});

/** Confirmed and dated — the OCH is coming. */
const confirmed = makeListItem({ ochAttending: true });

const held = makeListItem({
  id: "mtg_held",
  code: "IVP-2026-080",
  title: "Satellite licensing roundtable",
  status: "on_hold",
  previousStatus: "clearance",
  countryCode: "BR",
  countryName: "Brazil",
  countryCodes: ["BR"],
  orgName: "Agência Nacional de Telecomunicações",
  orgShortName: "Anatel",
  scheduledStart: null,
  scheduledEnd: null,
  candidateDates: [],
});

const closed = makeListItem({ id: "mtg_closed", code: "IVP-2025-012", status: "closed", title: "Closed out last year" });
const cancelled = makeListItem({ id: "mtg_cancelled", code: "IVP-2025-013", status: "cancelled", title: "Called off" });

const items: MeetingListItem[] = [requested, developing, confirmed, held, closed, cancelled];

const transition = vi.fn(async () => ({ ok: true as const, status: "developing" as const }));
const resume = vi.fn(async () => ({ ok: true as const, status: "clearance" as const }));
const onChanged = vi.fn();

function renderBoard(over: Partial<Parameters<typeof MeetingsBoard>[0]> = {}) {
  return render(<MeetingsBoard items={items} now={FIXTURE_NOW} transition={transition} resume={resume} onChanged={onChanged} {...over} />);
}

const columnNames = () => screen.getAllByRole("region").map((region) => within(region).getByRole("heading", { level: 3 }).textContent);

beforeEach(() => {
  transition.mockClear();
  resume.mockClear();
  onChanged.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe("MeetingsBoard", () => {
  it("groups cards into the pipeline columns, in order, with On Hold last", () => {
    renderBoard();
    expect(columnNames()).toEqual(["Requested", "Developing", "Clearance", "Confirmed", "Completed", "On Hold"]);

    const columns = screen.getAllByRole("region");
    expect(within(columns[0]!).getByText("IVP-2026-070")).toBeInTheDocument();
    expect(within(columns[1]!).getByText("IVP-2026-052")).toBeInTheDocument();
    expect(within(columns[3]!).getByText("IVP-2026-041")).toBeInTheDocument();
    expect(within(columns[5]!).getByText("IVP-2026-080")).toBeInTheDocument();
  });

  it("hides closed and cancelled until they are asked for", async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(screen.queryByText("IVP-2025-012")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /closed & cancelled/i }));

    expect(columnNames()).toEqual(["Requested", "Developing", "Clearance", "Confirmed", "Completed", "On Hold", "Closed", "Cancelled"]);
    expect(screen.getByText("IVP-2025-012")).toBeInTheDocument();
    expect(screen.getByText("IVP-2025-013")).toBeInTheDocument();
  });

  it("counts the cards in every column header", () => {
    renderBoard();
    const columns = screen.getAllByRole("region");
    expect(within(columns[0]!).getByText("1")).toBeInTheDocument();
    expect(within(columns[2]!).getByText("0")).toBeInTheDocument();
    expect(within(columns[2]!).getByText(/drop a meeting here/i)).toBeInTheDocument();
  });

  it("offers only the transitions the status machine allows", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-052/i }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Clearance", "Confirmed", "On Hold", "Cancelled"]);
  });

  it("offers Resume, and nothing else, on a held meeting", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-080/i }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Resume to Clearance"]);

    await user.click(within(menu).getByRole("menuitem", { name: /resume/i }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith("mtg_held"));
    expect(transition).not.toHaveBeenCalled();
  });

  it("explains a blocked move instead of sending it", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-052/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Confirmed" }));

    expect(toastError).toHaveBeenCalledWith("Confirming requires an accepted meeting date.");
    expect(transition).not.toHaveBeenCalled();
  });

  it("sends a plain move straight through", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-070/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Developing" }));

    await waitFor(() => expect(transition).toHaveBeenCalledWith({ meetingId: "mtg_req", to: "developing" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it("asks for a reason before a meeting goes on hold", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-070/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "On Hold" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(transition).not.toHaveBeenCalled();
  });

  it("moves a card dropped on another column", async () => {
    renderBoard();
    const card = screen.getByText("IVP-2026-070").closest("[draggable]");
    const target = screen.getAllByRole("region")[1]!;
    const dataTransfer = { setData: vi.fn(), getData: () => "mtg_req", effectAllowed: "move", dropEffect: "move", types: ["text/plain"] };

    fireEvent.dragStart(card!, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(transition).toHaveBeenCalledWith({ meetingId: "mtg_req", to: "developing" }));
  });

  it("refuses a drop the guards reject and says why", async () => {
    renderBoard();
    const card = screen.getByText("IVP-2026-052").closest("[draggable]");
    const target = screen.getAllByRole("region")[3]!;
    const dataTransfer = { setData: vi.fn(), getData: () => "mtg_ofcom", effectAllowed: "move", dropEffect: "move", types: ["text/plain"] };

    fireEvent.dragStart(card!, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(toastError).toHaveBeenCalledWith("Confirming requires an accepted meeting date.");
    expect(transition).not.toHaveBeenCalled();
  });

  it("puts the card back when the server refuses the move", async () => {
    transition.mockResolvedValueOnce({ ok: false, reason: "You cannot change this meeting." } as never);
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole("button", { name: /move IVP-2026-070/i }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Developing" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("You cannot change this meeting."));
    const columns = screen.getAllByRole("region");
    expect(within(columns[0]!).getByText("IVP-2026-070")).toBeInTheDocument();
  });

  it("says so when nothing matches the filters", () => {
    renderBoard({ items: [], hasFilters: true });
    expect(screen.getByText(/no meetings match these filters/i)).toBeInTheDocument();
  });
});
