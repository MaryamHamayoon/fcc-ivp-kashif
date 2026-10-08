// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CandidateDatePanel } from "@/components/meetings/record/CandidateDatePanel";
import type { CandidateDateRow } from "@/lib/db/types";
import { nyDate } from "@/lib/domain/fiscal-year";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }), usePathname: () => "/meetings/mtg_artci/schedule" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const MEETING_ID = "mtg_artci";

function candidate(over: Partial<CandidateDateRow> & Pick<CandidateDateRow, "id" | "start">): CandidateDateRow {
  return { meetingId: MEETING_ID, end: null, proposedBy: "visitor", status: "proposed", note: null, createdAt: new Date("2026-07-14T13:00:00Z"), ...over };
}

const accepted = candidate({ id: "cd_accepted", start: nyDate(2026, 9, 15, 10, 0), end: nyDate(2026, 9, 15, 12, 0), proposedBy: "fcc", status: "accepted" });
const proposed = candidate({ id: "cd_proposed", start: nyDate(2026, 9, 22, 10, 0), note: "Only the afternoon works for the delegation." });

const ok = async () => ({ ok: true as const });

function renderPanel(over: { dates?: CandidateDateRow[]; canUpdate?: boolean } = {}) {
  const props = {
    meetingId: MEETING_ID,
    countryCode: "CI",
    dates: over.dates ?? [accepted, proposed],
    canUpdate: over.canUpdate ?? true,
    acceptDate: vi.fn(ok),
    declineDate: vi.fn(ok),
    proposeDate: vi.fn(async () => ({ ok: true as const, id: "cd_new" })),
  };
  render(<CandidateDatePanel {...props} />);
  return props;
}

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CandidateDatePanel", () => {
  it("marks the accepted date and names who put each option on the table", () => {
    renderPanel();

    const accepted = screen.getByRole("listitem", { name: /Accepted/ });
    expect(accepted).toHaveTextContent("Accepted");
    expect(accepted).toHaveTextContent(/the FCC/);
    expect(screen.getByText(/Only the afternoon works for the delegation\./)).toBeInTheDocument();
    // An accepted date is settled: it is not offered for acceptance again.
    expect(screen.getAllByRole("button", { name: /^Accept / })).toHaveLength(1);
  });

  it("accepts a proposed date through the action it was handed", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Accept / }));
    await waitFor(() => expect(props.acceptDate).toHaveBeenCalledWith({ meetingId: MEETING_ID, id: "cd_proposed" }));
  });

  it("refuses a proposal whose end is before its start", async () => {
    const props = renderPanel();

    type(/^Start/, "2026-10-06T10:00");
    type(/^End/, "2026-10-06T09:00");
    fireEvent.click(screen.getByRole("button", { name: "Propose date" }));

    expect(await screen.findByText("The end must come after the start.")).toBeInTheDocument();
    expect(props.proposeDate).not.toHaveBeenCalled();
  });

  it("proposes a date on Washington time, with the proposer and note", async () => {
    const props = renderPanel();

    type(/^Start/, "2026-10-06T10:00");
    type(/^End/, "2026-10-06T11:30");
    fireEvent.click(screen.getByLabelText("The FCC"));
    type(/^Note/, "Room 8-B516 is free that morning.");
    fireEvent.click(screen.getByRole("button", { name: "Propose date" }));

    await waitFor(() => expect(props.proposeDate).toHaveBeenCalledTimes(1));
    expect(props.proposeDate).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      start: nyDate(2026, 10, 6, 10, 0).toISOString(),
      end: nyDate(2026, 10, 6, 11, 30).toISOString(),
      proposedBy: "fcc",
      note: "Room 8-B516 is free that morning.",
    });
  });

  it("gives a reader the negotiation without the controls", () => {
    renderPanel({ canUpdate: false });
    expect(screen.queryByRole("button", { name: /^Accept / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Propose date" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /Accepted/ })).toBeInTheDocument();
  });

  it("says what to do when no date has been floated at all", () => {
    renderPanel({ dates: [] });
    expect(screen.getByText(/No dates on the table yet/i)).toBeInTheDocument();
  });
});
