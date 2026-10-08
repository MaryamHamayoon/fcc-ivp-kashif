// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TransitionDialog, type TransitionAction } from "@/components/meetings/TransitionDialog";
import { nyDate } from "@/lib/domain/fiscal-year";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
  usePathname: () => "/meetings/mtg_artci",
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn(), message: vi.fn() } }));

type Options = { status?: "requested" | "developing" | "confirmed" | "on_hold"; hasAcceptedDate?: boolean; target?: "on_hold" | "cancelled"; action?: TransitionAction };

const onOpenChange = vi.fn();

function renderDialog({ status = "developing", hasAcceptedDate = false, target, action = vi.fn(async () => ({ ok: true as const })) }: Options = {}) {
  render(<TransitionDialog meetingId="mtg_artci" code="IVP-2026-041" status={status} hasAcceptedDate={hasAcceptedDate} open onOpenChange={onOpenChange} target={target} action={action} />);
  return { action };
}

const chooseStatus = (value: string) => fireEvent.change(screen.getByLabelText("New status"), { target: { value } });
const submit = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransitionDialog", () => {
  it("offers exactly the moves the status machine allows", () => {
    renderDialog({ status: "developing" });
    const options = within(screen.getByLabelText("New status")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose…", "Clearance", "Confirmed", "On Hold", "Cancelled"]);
  });

  it("tells a held meeting to be resumed rather than moved", () => {
    renderDialog({ status: "on_hold" });
    expect(screen.getByText(/resumed, not moved/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("New status")).not.toBeInTheDocument();
  });

  it("requires a reason and a follow-up date before a meeting goes on hold", async () => {
    const { action } = renderDialog({ target: "on_hold" });
    submit("Put on hold");

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/Say why it is on hold/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick the day to check back/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Why is it on hold?"), { target: { value: "  Embassy has not cleared the delegation to travel.  " } });
    fireEvent.change(screen.getByLabelText("Follow up on"), { target: { value: "2026-09-15" } });
    submit("Put on hold");

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith({
      meetingId: "mtg_artci",
      to: "on_hold",
      holdReason: "Embassy has not cleared the delegation to travel.",
      holdFollowUpAt: nyDate(2026, 9, 15, 9, 0).toISOString(),
      cancelReason: undefined,
      note: undefined,
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("IVP-2026-041 · On Hold"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("explains and blocks Confirmed until a date has been accepted", () => {
    const { action } = renderDialog({ status: "developing", hasAcceptedDate: false });
    chooseStatus("confirmed");

    expect(screen.getByText("Confirming requires an accepted meeting date.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Move to Confirmed" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
  });

  it("lets Confirmed through once a date is accepted", async () => {
    const { action } = renderDialog({ status: "developing", hasAcceptedDate: true });
    chooseStatus("confirmed");
    expect(screen.queryByText("Confirming requires an accepted meeting date.")).not.toBeInTheDocument();
    submit("Move to Confirmed");
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ meetingId: "mtg_artci", to: "confirmed" })));
  });

  it("shows the server's refusal in place instead of closing", async () => {
    const action = vi.fn<TransitionAction>(async () => ({ ok: false, reason: "You do not have permission to do that." }));
    renderDialog({ action });
    chooseStatus("clearance");
    submit("Move to Clearance");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You do not have permission to do that.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
