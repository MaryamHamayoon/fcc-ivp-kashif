// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Wizard } from "@/components/meetings/wizard/Wizard";
import { DRAFT_KEY } from "@/components/meetings/wizard/useWizardDraft";
import type { CreateMeetingAction, WizardOptions } from "@/components/meetings/wizard/wizard-schema";
import { CreateMeetingInput } from "@/lib/api/schemas";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/meetings/new" }));

const options: WizardOptions = {
  countries: [
    { code: "CI", name: "Côte d'Ivoire", regionId: "af" },
    { code: "SN", name: "Senegal", regionId: "af" },
    { code: "JP", name: "Japan", regionId: "eap" },
  ],
  regions: [
    { id: "af", name: "Africa" },
    { id: "eap", name: "Asia-Pacific" },
    { id: "wha", name: "Americas" },
  ],
  topics: [
    { id: "spectrum-sharing", name: "Spectrum Sharing & CBRS", group: "Spectrum" },
    { id: "spectrum-auctions", name: "Spectrum Auctions", group: "Spectrum" },
    { id: "ng911", name: "911 / NG911", group: "Public Safety" },
  ],
  leads: [{ id: "usr_priya", name: "Priya Raman", title: "Regional Lead — Africa" }],
};

const ok = vi.fn<CreateMeetingAction>(async () => ({ ok: true, id: "mtg_new", code: "IVP-2027-081" }));

function renderWizard(action: CreateMeetingAction = ok) {
  return render(<Wizard options={options} action={action} />);
}

/** Every message the field points at with aria-describedby, concatenated. */
function describedText(field: HTMLElement): string {
  return (field.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const heading = (name: RegExp) => screen.getByRole("heading", { name, level: 2 });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fillRequestor() {
  type("Full name", "Kouassi Mensah");
  type("Title or role", "Director General");
  type("Organization", "ARTCI");
  type("Kind of organization", "regulator");
  type("Email", "k.mensah@artci.example");
  type("Requested through", "State Department");
}

function fillCountry() {
  fireEvent.click(within(screen.getByRole("listbox", { name: /countries/i })).getByRole("option", { name: /Côte d'Ivoire/ }));
  type("OIA lead", "usr_priya");
}

function fillDelegation() {
  type("Meeting title", "Spectrum sharing study visit");
  type("Purpose", "Compare CBRS-style sharing frameworks.");
  type("Delegation size", "6");
  fireEvent.click(within(screen.getByRole("group", { name: /available topics/i })).getByRole("button", { name: /Spectrum Sharing & CBRS/ }));
  type(/their question about Spectrum Sharing/i, "How is the three-tier model enforced?");
}

function fillDates() {
  type("Preferred start", "2026-11-04T15:00");
  type("Preferred end", "2026-11-04T17:00");
  type("Alternate start", "2026-11-11T15:00");
  fireEvent.click(screen.getByLabelText("In person"));
}

beforeEach(() => {
  push.mockReset();
  ok.mockClear();
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("new-meeting wizard", () => {
  it("blocks Next until the step is valid and ties every message to its field", () => {
    renderWizard();
    expect(heading(/requestor/i)).toBeInTheDocument();

    next();
    expect(heading(/requestor/i)).toBeInTheDocument(); // still on step 1

    const name = screen.getByLabelText("Full name");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(describedText(name)).toMatch(/requestor's full name/i);
    expect(describedText(screen.getByLabelText("Email"))).toMatch(/email address/i);

    // A malformed email is still caught once the rest of the step is filled in.
    type("Full name", "Kouassi Mensah");
    type("Organization", "ARTCI");
    type("Kind of organization", "regulator");
    type("Email", "nope");
    next();
    expect(heading(/requestor/i)).toBeInTheDocument();
    expect(describedText(screen.getByLabelText("Email"))).toMatch(/valid email/i);

    type("Email", "k.mensah@artci.example");
    next();
    expect(heading(/country/i)).toBeInTheDocument();

    // Step 2 needs at least one country.
    next();
    expect(heading(/country/i)).toBeInTheDocument();
    expect(screen.getByText(/choose at least one country/i)).toBeInTheDocument();
  });

  it("advances on Enter in a text field, but only once the step is valid", () => {
    renderWizard();
    const form = screen.getByRole("button", { name: "Next" }).closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!); // Enter in a text field submits the step
    expect(heading(/requestor/i)).toBeInTheDocument();

    fillRequestor();
    fireEvent.submit(form!);
    expect(heading(/country/i)).toBeInTheDocument();
  });

  it("adds the top match when Enter is pressed in the topic filter", () => {
    renderWizard();
    fillRequestor();
    next();
    fillCountry();
    next();

    const filter = screen.getByLabelText("Filter topics");
    fireEvent.change(filter, { target: { value: "auction" } });
    fireEvent.keyDown(filter, { key: "Enter" });

    expect(within(screen.getByRole("list", { name: /chosen topics/i })).getByText("Spectrum Auctions")).toBeInTheDocument();
    expect(heading(/delegation/i)).toBeInTheDocument(); // did not advance
    expect(filter).toHaveValue("");
  });

  it("derives the region from the first country and lets it be overridden", () => {
    renderWizard();
    fillRequestor();
    next();
    fillCountry();
    expect(screen.getByLabelText("Region")).toHaveValue("af");
    expect(screen.getByRole("button", { name: /remove Côte d'Ivoire/i })).toBeInTheDocument();
    type("Region", "eap");
    expect(screen.getByLabelText("Region")).toHaveValue("eap");
  });

  it("saves a draft to localStorage and offers to resume it after a remount", async () => {
    const first = renderWizard();
    type("Full name", "Kouassi Mensah");
    type("Organization", "ARTCI");

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toContain("Kouassi Mensah"));
    first.unmount();

    renderWizard();
    expect(screen.getByRole("heading", { name: /resume draft/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue(""); // nothing is restored until asked
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Kouassi Mensah");
    expect(screen.getByLabelText("Organization")).toHaveValue("ARTCI");
    expect(screen.queryByRole("heading", { name: /resume draft/i })).toBeNull();
  });

  it("throws the draft away when the reader starts fresh", async () => {
    const first = renderWizard();
    type("Full name", "Kouassi Mensah");
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toContain("Kouassi Mensah"));
    first.unmount();

    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /start fresh/i }));
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("reviews every entered value, then creates the meeting and opens its record", async () => {
    renderWizard();
    fillRequestor();
    next();
    fillCountry();
    next();
    fillDelegation();
    next();
    fillDates();
    next();
    fireEvent.click(screen.getByRole("switch", { name: /audio-visual/i }));
    fireEvent.click(screen.getByLabelText("Consecutive"));
    type("Local contact", "Embassy duty officer");
    next();

    expect(heading(/review/i)).toBeInTheDocument();
    const review = screen.getByRole("region", { name: /review/i });
    for (const value of [
      "Kouassi Mensah",
      "Director General",
      "ARTCI",
      "Regulator",
      "k.mensah@artci.example",
      "State Department",
      "Côte d'Ivoire",
      "Africa",
      "Priya Raman",
      "Spectrum sharing study visit",
      "Compare CBRS-style sharing frameworks.",
      "Spectrum Sharing & CBRS",
      "How is the three-tier model enforced?",
      "In person",
      "Consecutive",
      "Embassy duty officer",
    ]) {
      expect(within(review).getByText(new RegExp(escapeRe(value)))).toBeInTheDocument();
    }
    expect(within(review).getAllByText(/Nov 4, 2026/).length).toBeGreaterThan(0);
    expect(within(review).getByText(/Nov 11, 2026/)).toBeInTheDocument();
    expect(within(review).getByRole("button", { name: /edit dates/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create meeting/i }));

    await waitFor(() => expect(ok).toHaveBeenCalledTimes(1));
    const parsed = CreateMeetingInput.safeParse(ok.mock.calls[0]?.[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      requestor: { name: "Kouassi Mensah", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example", viaIntermediary: "State Department" },
      countryCodes: ["CI"],
      regionId: "af",
      leadUserId: "usr_priya",
      delegation: { headline: "Spectrum sharing study visit", size: 6 },
      topics: [{ topicId: "spectrum-sharing", detail: "How is the three-tier model enforced?" }],
      dates: { format: "in_person", timezone: "America/New_York" },
      logistics: { needsAv: true, interpreter: "consecutive", localContact: "Embassy duty officer" },
      ochRequested: false,
    });
    // 3:00 PM Washington time on the requested day, whatever zone the browser sits in.
    expect(parsed.data?.dates.preferredStart.toISOString()).toBe("2026-11-04T20:00:00.000Z");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/meetings/mtg_new"));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("surfaces a rejected submission without losing the draft", async () => {
    const failing = vi.fn<CreateMeetingAction>(async () => ({ ok: false, error: "Unknown topic: spectrum-sharing" }));
    renderWizard(failing);
    fillRequestor();
    next();
    fillCountry();
    next();
    fillDelegation();
    next();
    fillDates();
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: /create meeting/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unknown topic/i);
    expect(push).not.toHaveBeenCalled();
    expect(heading(/review/i)).toBeInTheDocument();
  });
});
