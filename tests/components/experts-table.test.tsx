// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpertsTable } from "@/components/directory/ExpertsTable";
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
    { topicId: "spectrum-sharing", name: "Spectrum Sharing", count: 2 },
    { topicId: "earth-stations", name: "Earth Stations", count: 1 },
  ],
  engagements: 8,
  avgReplyBusinessDays: 2.4,
  lastBriefedAt: new Date("2026-06-01T16:00:00Z"),
};

const priya: ExpertSummary = {
  id: "stf_0002",
  name: "Priya Raman",
  title: null,
  email: "priya.raman@fcc.gov",
  phone: null,
  bureauCode: null,
  bureauName: null,
  expertise: [],
  engagements: 0,
  avgReplyBusinessDays: null,
  lastBriefedAt: null,
};

const onOpen = vi.fn();
const onClearFilters = vi.fn();

function renderTable(experts: ExpertSummary[] = [tomas, priya], props: Partial<Parameters<typeof ExpertsTable>[0]> = {}) {
  return render(<ExpertsTable experts={experts} maxEngagements={8} sort="engagements" onOpen={onOpen} hasFilters={false} onClearFilters={onClearFilters} {...props} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExpertsTable", () => {
  it("is one table, a person to a row: who, where, what on, how much, how fast, how lately", () => {
    renderTable();
    const table = screen.getByRole("table", { name: "FCC experts and points of contact" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Name", "Bureau", "Expertise", "Engagements", "Avg reply", "Last briefed", "Email"]);

    const row = within(table).getByRole("row", { name: /Tomas Lindqvist/ });
    const cells = within(row);
    // On a phone the Bureau column is gone, so the code rides with the title under the name.
    expect(cells.getByRole("rowheader")).toHaveTextContent("Tomas LindqvistSB Electronics Engineer");
    expect(cells.getByRole("cell", { name: "SB Space Bureau" })).toBeInTheDocument();
    // Two topics in the row, the rest as a count; the profile lists them all.
    expect(within(cells.getByRole("list", { name: "Expertise" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["NGSO Systems", "Orbital Debris", "+2 more"]);
    expect(cells.getByText("8")).toBeInTheDocument();
    expect(cells.getByRole("cell", { name: "2.4 days" })).toBeInTheDocument();
    expect(cells.getByText(formatDateNY(tomas.lastBriefedAt!))).toBeInTheDocument();
    expect(cells.getByText("tomas.lindqvist@fcc.gov")).toBeInTheDocument();
  });

  it("says what is missing in words, not only with a dash", () => {
    renderTable();
    const cells = within(screen.getByRole("row", { name: /Priya Raman/ }));
    expect(cells.getByText("No bureau on file")).toBeInTheDocument();
    expect(cells.getByText("No briefings yet")).toBeInTheDocument();
    expect(cells.getByText("No replies yet")).toBeInTheDocument();
    expect(cells.getByText("Never briefed")).toBeInTheDocument();
  });

  it("opens a person's profile from their name", async () => {
    renderTable();
    const name = screen.getByRole("button", { name: "Tomas Lindqvist" });
    expect(name).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(name);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(tomas);
  });

  it("opens it from anywhere else on the row too, but never from the copy button", async () => {
    renderTable();
    const row = screen.getByRole("row", { name: /Tomas Lindqvist/ });
    await userEvent.click(within(row).getByText("Space Bureau"));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(tomas);

    onOpen.mockClear();
    await userEvent.click(within(row).getByRole("button", { name: "Copy email address for Tomas Lindqvist" }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("marks the column the list is sorted by", () => {
    renderTable();
    expect(screen.getByRole("columnheader", { name: "Engagements" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");

    cleanup();
    renderTable([tomas], { sort: "name" });
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Engagements" })).not.toHaveAttribute("aria-sort");
  });

  it("says so when nobody matches, and offers the way back", async () => {
    renderTable([], { hasFilters: true });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "No one matches." })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });
});
