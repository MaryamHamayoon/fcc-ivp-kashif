// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpertProfileDialog } from "@/components/directory/ExpertProfileDialog";
import { formatDateNY } from "@/lib/format";
import type { ExpertSummary } from "@/lib/services/directory";

const tomas: ExpertSummary = {
  id: "stf_0001",
  name: "Tomas Lindqvist",
  title: "Electronics Engineer",
  email: "tomas.lindqvist@fcc.gov",
  phone: "(202) 418-1234",
  bureauCode: "SB",
  bureauName: "Space Bureau",
  expertise: [
    { topicId: "ngso", name: "NGSO Systems", count: 5 },
    { topicId: "orbital-debris", name: "Orbital Debris", count: 3 },
  ],
  engagements: 8,
  avgReplyBusinessDays: 2.4,
  lastBriefedAt: new Date("2026-06-01T16:00:00Z"),
};

const writeText = vi.fn<(text: string) => Promise<void>>();
const onClose = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue();
  // After userEvent's own clipboard stub, so the component talks to this one.
  userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExpertProfileDialog", () => {
  it("is closed until somebody is chosen", () => {
    render(<ExpertProfileDialog expert={null} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says who they are, what they brief on and how the program has used them", async () => {
    render(<ExpertProfileDialog expert={tomas} onClose={onClose} />);
    const dialog = within(await screen.findByRole("dialog", { name: "Tomas Lindqvist" }));

    expect(dialog.getByText("Electronics Engineer")).toBeInTheDocument();
    expect(dialog.getByText("Space Bureau")).toBeInTheDocument();

    const figures = within(dialog.getByRole("group", { name: "With the program" }));
    expect(figures.getByText("Engagements").closest("div")).toHaveTextContent("8");
    expect(figures.getByText("Avg reply").closest("div")).toHaveTextContent("2.4 days");
    expect(figures.getByText("Last briefed").closest("div")).toHaveTextContent(formatDateNY(tomas.lastBriefedAt!));

    const topics = within(dialog.getByRole("list", { name: "Briefs on" })).getAllByRole("listitem");
    expect(topics.map((li) => li.textContent)).toEqual(["NGSO Systems5 briefings", "Orbital Debris3 briefings"]);
  });

  it("gives the email address and the phone number as links, each with its own copy", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ExpertProfileDialog expert={tomas} onClose={onClose} />);
    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByRole("link", { name: "tomas.lindqvist@fcc.gov" })).toHaveAttribute("href", "mailto:tomas.lindqvist@fcc.gov");
    expect(dialog.getByRole("link", { name: "(202) 418-1234" })).toHaveAttribute("href", "tel:+12024181234");

    await user.click(dialog.getByRole("button", { name: "Copy email address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("tomas.lindqvist@fcc.gov"));
    expect(await dialog.findByText("Email address copied")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Copy phone number" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("(202) 418-1234"));
  });

  it("ends on the two ways on: write to them, or read the whole record", async () => {
    render(<ExpertProfileDialog expert={tomas} onClose={onClose} />);
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("link", { name: "Email Tomas" })).toHaveAttribute("href", "mailto:tomas.lindqvist@fcc.gov");
    expect(dialog.getByRole("link", { name: "Open full profile" })).toHaveAttribute("href", "/directory/staff/stf_0001");
  });

  it("leaves out what is not on file rather than showing a blank", async () => {
    render(<ExpertProfileDialog expert={{ ...tomas, title: null, phone: null, bureauCode: null, bureauName: null, expertise: [], engagements: 0, avgReplyBusinessDays: null, lastBriefedAt: null }} onClose={onClose} />);
    const dialog = within(await screen.findByRole("dialog", { name: "Tomas Lindqvist" }));
    expect(dialog.queryByRole("button", { name: "Copy phone number" })).toBeNull();
    expect(dialog.queryByRole("list", { name: "Briefs on" })).toBeNull();
    expect(dialog.getByText("No briefings on record yet.")).toBeInTheDocument();
    const figures = within(dialog.getByRole("group", { name: "With the program" }));
    expect(figures.getByText("Avg reply").closest("div")).toHaveTextContent("No replies yet");
    expect(figures.getByText("Last briefed").closest("div")).toHaveTextContent("Never");
  });

  it("closes on request", async () => {
    render(<ExpertProfileDialog expert={tomas} onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
