// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ExpertsByBureau } from "@/components/meetings/record/ExpertsByBureau";
import type { MeetingRecord } from "@/lib/services/record";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }), usePathname: () => "/meetings/mtg_artci/people" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const NOW = new Date("2026-08-29T14:00:00Z"); // Saturday
const MEETING_ID = "mtg_artci";

type Assignment = MeetingRecord["experts"][number];

function staff(id: string, name: string, title: string, code: string, bureauName: string) {
  return { id, name, email: `${id}@fcc.gov`, title, bureauCode: code, phone: null, active: true, bureau: { code, name: bureauName, kind: "office" as const, sortOrder: 1 } };
}

function assignment(over: Partial<Assignment> & Pick<Assignment, "id" | "staff">): Assignment {
  return {
    meetingId: MEETING_ID,
    staffId: over.staff.id,
    bureauCode: over.staff.bureauCode,
    role: "briefer",
    status: "tbd",
    requestedAt: null,
    respondedAt: null,
    note: null,
    createdAt: new Date("2026-07-01T13:00:00Z"),
    ...over,
  };
}

const dana = assignment({
  id: "mex_dana",
  staff: staff("stf_dana", "Dana Whitfield", "Spectrum Policy Analyst", "OEA", "Office of Economics and Analytics"),
  status: "confirmed",
  requestedAt: new Date("2026-07-08T13:00:00Z"),
  respondedAt: new Date("2026-07-10T13:00:00Z"),
});
// Asked on Monday 24 Aug; four business days have passed by Saturday 29 Aug.
const rosa = assignment({
  id: "mex_rosa",
  staff: staff("stf_rosa", "Rosa Delgado", "Deputy Chief", "WTB", "Wireless Telecommunications Bureau"),
  status: "requested",
  requestedAt: new Date("2026-08-24T13:00:00Z"),
});
const owen = assignment({ id: "mex_owen", staff: staff("stf_owen", "Owen Park", "Attorney Advisor", "WTB", "Wireless Telecommunications Bureau") });

const ok = async () => ({ ok: true as const });

function renderExperts(over: { experts?: Assignment[]; canUpdate?: boolean; canRespond?: boolean; onRequest?: typeof ok; onRespond?: typeof ok; onRemove?: typeof ok } = {}) {
  const props = {
    meetingId: MEETING_ID,
    experts: over.experts ?? [dana, rosa, owen],
    now: NOW,
    canUpdate: over.canUpdate ?? true,
    canRespond: over.canRespond ?? true,
    requestExpert: over.onRequest ?? vi.fn(ok),
    respondExpert: over.onRespond ?? vi.fn(ok),
    removeExpert: over.onRemove ?? vi.fn(ok),
  };
  render(<ExpertsByBureau {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExpertsByBureau", () => {
  it("groups the briefers by their bureau", () => {
    renderExperts();

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /Office of Economics and Analytics/ })).toBeInTheDocument();

    const wireless = screen.getByRole("group", { name: /Wireless Telecommunications Bureau/ });
    expect(within(wireless).getAllByRole("listitem")).toHaveLength(2);
    expect(within(wireless).getByText("Rosa Delgado")).toBeInTheDocument();
    expect(within(wireless).getByText(/Deputy Chief/)).toBeInTheDocument();
  });

  it("offers Request before an expert is asked, and Confirm or Decline once they have been", () => {
    renderExperts();

    expect(screen.getByRole("button", { name: /Request Owen Park/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Rosa Delgado/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline for Rosa Delgado/ })).toBeInTheDocument();
    // Dana has already answered: there is nothing left to ask her.
    expect(screen.queryByRole("button", { name: /Request Dana Whitfield/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm Dana Whitfield/ })).not.toBeInTheDocument();
  });

  it("shows how long a request has been waiting, in business days", () => {
    renderExperts();
    expect(screen.getByText("4 business days awaiting reply")).toBeInTheDocument();
    expect(screen.getByText(/Confirmed/)).toBeInTheDocument();
  });

  it("hides every control from a reader who may not edit or answer", () => {
    renderExperts({ canUpdate: false, canRespond: false });

    expect(screen.queryByRole("button", { name: /Request/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getByText("Rosa Delgado")).toBeInTheDocument();
  });

  it("lets a coordinator answer for an expert even when they cannot edit the meeting", () => {
    renderExperts({ canUpdate: false, canRespond: true });
    expect(screen.getByRole("button", { name: /Confirm Rosa Delgado/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request Owen Park/ })).not.toBeInTheDocument();
  });

  it("sends the briefing request through the action it was handed", async () => {
    const props = renderExperts();
    fireEvent.click(screen.getByRole("button", { name: /Request Owen Park/ }));
    await waitFor(() => expect(props.requestExpert).toHaveBeenCalledWith({ meetingId: MEETING_ID, id: "mex_owen" }));
  });

  it("records a confirmation against the assignment, not the person", async () => {
    const props = renderExperts();
    fireEvent.click(screen.getByRole("button", { name: /Confirm Rosa Delgado/ }));
    await waitFor(() => expect(props.respondExpert).toHaveBeenCalledWith({ meetingId: MEETING_ID, meetingExpertId: "mex_rosa", status: "confirmed" }));
  });

  it("says so when nobody has been lined up yet", () => {
    renderExperts({ experts: [] });
    expect(screen.getByText(/No FCC experts on this meeting yet/i)).toBeInTheDocument();
  });
});
