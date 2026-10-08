// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecordHeader } from "@/components/meetings/record/RecordHeader";
import type { MeetingDetail } from "@/lib/db/repos/meetings";
import type { PolicyUser } from "@/lib/domain/policy";
import { ADMIN, makeRecord, VIEWER } from "@/tests/fixtures/record";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
  usePathname: () => "/meetings/mtg_artci",
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn(), message: vi.fn() } }));

const transition = vi.fn(async () => ({ ok: true as const }));
const resume = vi.fn(async () => ({ ok: true as const, status: "developing" as const }));

function renderHeader(over: Partial<MeetingDetail> = {}, actor: PolicyUser = ADMIN) {
  return render(<RecordHeader record={makeRecord(over, actor)} transition={transition} resume={resume} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecordHeader", () => {
  it("places the meeting: breadcrumb, delegation, title, code and status", () => {
    renderHeader();

    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Meetings" })).toHaveAttribute("href", "/meetings");
    expect(within(crumbs).getByText("IVP-2026-041")).toHaveAttribute("aria-current", "page");

    expect(screen.getByRole("heading", { level: 1, name: "Spectrum sharing study visit" })).toBeInTheDocument();
    expect(screen.getByText(/ARTCI/)).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();

    const code = screen.getAllByText("IVP-2026-041").find((el) => el.closest("nav") === null);
    expect(code).toHaveClass("numeric");
  });

  it("shows readiness and the people who own the meeting", () => {
    renderHeader();
    expect(screen.getByRole("img", { name: "Readiness 100%" })).toBeInTheDocument();
    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText("Marcus Bell")).toBeInTheDocument();
  });

  it("flags a meeting the Chairman's office is attending, and only then", () => {
    const { unmount } = renderHeader();
    expect(screen.queryByText(/OCH/)).not.toBeInTheDocument();
    unmount();

    renderHeader({ ochAttending: true });
    expect(screen.getByText(/OCH/)).toBeInTheDocument();
  });

  it("offers every action to a coordinator", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Change status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Put on hold" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log activity" })).toHaveAttribute("href", "/meetings/mtg_artci/activity#composer");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/meetings/mtg_artci/edit");
  });

  it("offers none of them to a viewer", () => {
    renderHeader({}, VIEWER);
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Put on hold" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Spectrum sharing study visit" })).toBeInTheDocument();
  });

  it("opens the transition dialog from Change status", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Change status" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("New status")).toBeInTheDocument();
  });

  it("resumes a held meeting in one click", async () => {
    renderHeader({ status: "on_hold", previousStatus: "developing", holdReason: "Travel not cleared", holdFollowUpAt: new Date("2026-09-15T13:00:00Z") });

    expect(screen.queryByRole("button", { name: "Put on hold" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    await waitFor(() => expect(resume).toHaveBeenCalledWith("mtg_artci"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("IVP-2026-041 · Developing"));
  });
});
