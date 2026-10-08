// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditMeetingForm, type EditTopicOption, type EditUserOption } from "@/components/meetings/record/EditMeetingForm";
import type { RecordAction } from "@/components/meetings/record/tab-actions";
import { makeRecord } from "@/tests/fixtures/record";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh }),
  usePathname: () => "/meetings/mtg_artci/edit",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const topicOptions: EditTopicOption[] = [
  { id: "spectrum-sharing", name: "Spectrum Sharing", group: "Spectrum" },
  { id: "spectrum-auctions", name: "Spectrum Auctions", group: "Spectrum" },
  { id: "imt", name: "IMT / 5G / 6G", group: "Spectrum" },
];

const userOptions: EditUserOption[] = [
  { id: "usr_priya", name: "Priya Raman", title: "Regional Lead — Africa" },
  { id: "usr_marcus", name: "Marcus Bell", title: null },
];

function renderForm(over: { updateMeeting?: RecordAction } = {}) {
  const record = makeRecord();
  const updateMeeting = over.updateMeeting ?? vi.fn(async () => ({ ok: true as const }));
  render(<EditMeetingForm record={record} topicOptions={topicOptions} userOptions={userOptions} updateMeeting={updateMeeting} />);
  return { record, updateMeeting };
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

describe("EditMeetingForm", () => {
  it("renders the meeting's current values", () => {
    renderForm();

    expect(screen.getByLabelText("Meeting title")).toHaveValue("Spectrum sharing study visit");
    expect(screen.getByLabelText("Purpose")).toHaveValue("Compare approaches to shared spectrum access in the 3.5 GHz band.");
    expect(screen.getByRole("radio", { name: "In person" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "OCH attending" })).not.toBeChecked();
    expect(screen.getByLabelText("Priority")).toHaveValue("normal");
    expect(screen.getByLabelText("Delegation size")).toHaveValue(6);
    expect(screen.getByLabelText("OIA lead")).toHaveValue("usr_priya");
    expect(screen.getByLabelText("Coordinator")).toHaveValue("usr_marcus");

    const ranked = within(screen.getByRole("list", { name: "Chosen topics, most important first" })).getAllByRole("listitem");
    expect(ranked.map((item) => item.textContent)).toEqual([expect.stringContaining("Spectrum Sharing"), expect.stringContaining("Spectrum Auctions")]);
  });

  it("blocks submit on a too-short title, with an inline message", () => {
    const { updateMeeting } = renderForm();

    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Enter at least 2 characters.")).toBeInTheDocument();
    expect(updateMeeting).not.toHaveBeenCalled();
  });

  it("moves focus to the first invalid field on a blocked save, so it is not silently ignored", () => {
    renderForm();
    const title = screen.getByLabelText("Meeting title");

    fireEvent.change(title, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Enter at least 2 characters.")).toBeInTheDocument();
    expect(document.activeElement).toBe(title);
  });

  it("scrolls the invalid field into view when the browser supports it", () => {
    // jsdom does not implement scrollIntoView at all; attaching a spy both proves the fix
    // calls it when present and stands in for the "missing in jsdom" case in every other test.
    renderForm();
    const title = screen.getByLabelText("Meeting title");
    const scrollIntoView = vi.fn();
    title.scrollIntoView = scrollIntoView;

    fireEvent.change(title, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("submits the parsed payload and returns to the record on success", async () => {
    const { updateMeeting, record } = renderForm();

    fireEvent.change(screen.getByLabelText("Delegation size"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateMeeting).toHaveBeenCalledTimes(1));
    expect(updateMeeting).toHaveBeenCalledWith({
      meetingId: "mtg_artci",
      title: "Spectrum sharing study visit",
      purpose: "Compare approaches to shared spectrum access in the 3.5 GHz band.",
      format: "in_person",
      ochAttending: false,
      priority: "normal",
      delegationSize: 8,
      leadUserId: "usr_priya",
      coordinatorUserId: "usr_marcus",
      topicIds: ["spectrum-sharing", "spectrum-auctions"],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(record.href));
  });

  it("shows the alert when the action refuses to save", async () => {
    const updateMeeting = vi.fn(async () => ({ ok: false as const, error: "Someone else changed this meeting." }));
    renderForm({ updateMeeting });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Someone else changed this meeting.");
  });
});
