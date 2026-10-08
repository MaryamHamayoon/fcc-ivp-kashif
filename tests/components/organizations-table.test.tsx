// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizationsTable, type OrganizationRowData } from "@/components/directory/OrganizationsTable";
import { formatDateNY } from "@/lib/format";

const acm: OrganizationRowData = {
  id: "org_acm",
  name: "Authority for Consumers and Markets (Netherlands)",
  shortName: "ACM",
  kind: "regulator",
  kindLabel: "Regulator",
  countryCode: "NL",
  countryName: "Netherlands",
  meetingCount: 3,
  lastMeetingAt: new Date("2026-05-12T14:00:00Z"),
  contacts: [
    { id: "c1", name: "Jan de Vries", title: "Senior Policy Advisor", email: "jan.devries@acm.example", phone: "+31 70 722 2000" },
    { id: "c2", name: "Sanne Bakker", title: null, email: null, phone: null },
  ],
};

const itu: OrganizationRowData = {
  id: "org_itu",
  name: "International Telecommunication Union",
  shortName: null,
  kind: "international_org",
  kindLabel: "International organization",
  countryCode: null,
  countryName: null,
  meetingCount: 0,
  lastMeetingAt: null,
  contacts: [],
};

afterEach(cleanup);

describe("OrganizationsTable", () => {
  it("is one table: who, from where, what kind, how many contacts and meetings, how lately", () => {
    render(<OrganizationsTable organizations={[acm, itu]} />);
    const table = screen.getByRole("table", { name: "Organizations and their contacts" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Contacts, shown or hidden", "Organization", "Country", "Kind", "Contacts", "Meetings", "Last engaged"]);

    const row = within(within(table).getByRole("row", { name: /ACM/ }));
    // The short name is the link; the full name sits under it rather than beside it behind a dash.
    expect(row.getByRole("link", { name: "ACM" })).toHaveAttribute("href", "/directory/organizations/org_acm");
    expect(row.getByText("Authority for Consumers and Markets (Netherlands)")).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "Netherlands" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "Regulator" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(row.getByRole("cell", { name: "3" })).toBeInTheDocument();
    expect(row.getByText(formatDateNY(acm.lastMeetingAt!))).toBeInTheDocument();
  });

  it("names an organization in full when it has no short name, and says what is not on file", () => {
    render(<OrganizationsTable organizations={[itu]} />);
    const row = within(screen.getByRole("row", { name: /International Telecommunication Union/ }));
    expect(row.getByRole("link", { name: "International Telecommunication Union" })).toBeInTheDocument();
    expect(row.getByText("No country on file")).toBeInTheDocument();
    expect(row.getByText("Never engaged")).toBeInTheDocument();
  });

  it("discloses an organization's contacts in place, each address with its own copy", async () => {
    render(<OrganizationsTable organizations={[acm]} />);
    const toggle = screen.getByRole("button", { name: "Show contacts for ACM" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Jan de Vries")).toBeNull();

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide contacts for ACM" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "jan.devries@acm.example" })).toHaveAttribute("href", "mailto:jan.devries@acm.example");
    expect(screen.getByRole("button", { name: "Copy email address for Jan de Vries" })).toBeInTheDocument();
    expect(screen.getByText("Sanne Bakker")).toBeInTheDocument();
  });

  it("says so when no organization matches the search, and offers the way back", async () => {
    const onClearFilters = vi.fn();
    render(<OrganizationsTable organizations={[]} hasFilters onClearFilters={onClearFilters} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "No organization matches." })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });
});
