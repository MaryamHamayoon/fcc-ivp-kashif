// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StepCountry } from "@/components/meetings/wizard/StepCountry";
import { StepDates } from "@/components/meetings/wizard/StepDates";
import { StepRequestor } from "@/components/meetings/wizard/StepRequestor";
import { EMPTY_DRAFT, type FieldErrors } from "@/components/meetings/wizard/wizard-schema";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings/new",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const countries = [
  { code: "CI", name: "Côte d'Ivoire", regionId: "af" },
  { code: "SN", name: "Senegal", regionId: "af" },
  { code: "JP", name: "Japan", regionId: "eap" },
];
const regions = [
  { id: "af", name: "Africa" },
  { id: "eap", name: "Asia-Pacific" },
];
const leads = [{ id: "usr_priya", name: "Priya Raman", title: "Regional Lead — Africa" }];

/** Every message a submitted-but-invalid step shows, so the error wiring is scanned too. */
const requestorErrors: FieldErrors = { "requestor.name": "Who is asking?", "requestor.email": "A working email, please" };

describe("intake wizard accessibility", () => {
  it("step 1 — requestor carries no WCAG violations, blank or with errors showing", async () => {
    const { container, rerender } = render(<StepRequestor value={EMPTY_DRAFT.requestor} onChange={vi.fn()} errors={{}} />);
    await expectNoViolations(container);
    rerender(<StepRequestor value={EMPTY_DRAFT.requestor} onChange={vi.fn()} errors={requestorErrors} />);
    await expectNoViolations(container);
  });

  it("step 2 — country, region and lead carry no WCAG violations", async () => {
    const { container, rerender } = render(<StepCountry countryCodes={[]} regionId="" leadUserId="" onChange={vi.fn()} errors={{}} countries={countries} regions={regions} leads={leads} />);
    await expectNoViolations(container);
    rerender(<StepCountry countryCodes={["CI", "SN"]} regionId="af" leadUserId="usr_priya" onChange={vi.fn()} errors={{ countryCodes: "Pick at least one country" }} countries={countries} regions={regions} leads={leads} />);
    await expectNoViolations(container);
  });

  it("step 4 — dates and format carry no WCAG violations", async () => {
    const { container, rerender } = render(<StepDates value={EMPTY_DRAFT.dates} onChange={vi.fn()} errors={{}} />);
    await expectNoViolations(container);
    rerender(<StepDates value={{ ...EMPTY_DRAFT.dates, preferredStart: "2026-09-15T10:00", format: "in_person" }} onChange={vi.fn()} errors={{ "dates.preferredEnd": "End must be after the start" }} />);
    await expectNoViolations(container);
  });
});
