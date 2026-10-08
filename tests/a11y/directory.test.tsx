// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { DirectoryToolbar } from "@/components/directory/DirectoryToolbar";
import { ExpertProfileDialog } from "@/components/directory/ExpertProfileDialog";
import { ExpertsTable } from "@/components/directory/ExpertsTable";
import { BriefersList } from "@/components/dossier/BriefersList";
import { DossierHero } from "@/components/dossier/DossierHero";
import { DossierSection } from "@/components/dossier/DossierSection";
import { EngagementTimeline } from "@/components/dossier/EngagementTimeline";
import { MaterialsShelf } from "@/components/dossier/MaterialsShelf";
import type { Dossier } from "@/lib/domain/dossier";
import type { CountrySummary, ExpertSummary } from "@/lib/services/directory";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/directory",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const expert: ExpertSummary = {
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
  lastBriefedAt: new Date("2026-06-01T00:00:00Z"),
};

const countries: CountrySummary[] = [
  {
    cca2: "CI",
    name: "Côte d'Ivoire",
    regionName: "Africa",
    fyCount: 3,
    engagementCount: 7,
    lastEngagedAt: new Date("2026-06-11T14:00:00Z"),
    topTopics: [
      { key: "spectrum-sharing", label: "Spectrum Sharing", count: 4 },
      { key: "broadband-mapping", label: "Broadband Mapping", count: 2 },
    ],
  },
  {
    cca2: "JP",
    name: "Japan",
    regionName: "Asia-Pacific",
    fyCount: 0,
    engagementCount: 2,
    lastEngagedAt: null,
    topTopics: [],
  },
];

describe("directory and countries accessibility", () => {
  const bare: ExpertSummary = { ...expert, id: "stf_0002", name: "Priya Raman", title: null, bureauCode: null, bureauName: null, avgReplyBusinessDays: null, engagements: 0, phone: null, lastBriefedAt: null, expertise: [] };

  it("the experts table carries no WCAG violations, with full rows, bare rows and none", async () => {
    const props = { maxEngagements: 8, sort: "engagements" as const, onOpen: () => {}, hasFilters: true, onClearFilters: () => {} };
    const { container, rerender } = render(<ExpertsTable experts={[expert, bare]} {...props} />);
    await expectNoViolations(container);
    rerender(<ExpertsTable experts={[]} {...props} />);
    await expectNoViolations(container);
  });

  it("a person's profile card carries no WCAG violations, with and without the optional parts", async () => {
    const { rerender } = render(<ExpertProfileDialog expert={expert} onClose={() => {}} />);
    // The card is portalled to the body, so that is what is checked.
    await expectNoViolations(await screen.findByRole("dialog"));
    rerender(<ExpertProfileDialog expert={bare} onClose={() => {}} />);
    await expectNoViolations(await screen.findByRole("dialog", { name: "Priya Raman" }));
  });

  it("the directory toolbar carries no WCAG violations on either tab", async () => {
    const props = { params: new URLSearchParams("bureauCode=SB"), setFilter: () => {}, counts: { experts: 214, organizations: 61 }, bureaus: [{ code: "SB", name: "Space Bureau", staff: 8 }], shown: 8, total: 8 };
    const { container, rerender } = render(<DirectoryToolbar tab="experts" {...props} />);
    await expectNoViolations(container);
    rerender(<DirectoryToolbar tab="organizations" {...props} />);
    await expectNoViolations(container);
  });

  it("the countries table carries no WCAG violations", async () => {
    const { container } = render(<CountriesTable countries={countries} />);
    await expectNoViolations(container);
  });
});

const dossier: Dossier = {
  figures: { engagements: 7, engagementsFy: 3, fy: 2026, participants: 54, firstAt: new Date("2023-02-14T15:00:00Z"), lastAt: new Date("2026-06-11T14:00:00Z"), next: { id: "mtg_next", code: "IVP-2026-041", start: new Date("2026-09-15T14:00:00Z"), status: "confirmed" } },
  timeline: {
    lanes: [
      { id: "spectrum-sharing", name: "Spectrum Sharing" },
      { id: "other", name: "Other" },
    ],
    meetings: [
      { id: "a", code: "IVP-2026-041", title: "Spectrum sharing study visit", status: "confirmed", date: new Date("2026-09-15T14:00:00Z"), participants: 12, laneId: "spectrum-sharing", fiscalYear: 2026 },
      { id: "b", code: "IVP-2024-030", title: "Broadband mapping exchange", status: "completed", date: new Date("2024-05-02T14:00:00Z"), participants: 9, laneId: "other", fiscalYear: 2024 },
      { id: "c", code: "IVP-2027-001", title: "Orbital debris briefing", status: "requested", date: null, participants: 0, laneId: "other", fiscalYear: 2027 },
    ],
    firstFy: 2024,
    lastFy: 2027,
  },
  briefers: [
    { staffId: "stf_dana", name: "Dana Whitfield", bureauCode: "OEA", bureauName: "Office of Economics and Analytics", count: 3 },
    { staffId: "stf_tomas", name: "Tomas Lindqvist", bureauCode: "SB", bureauName: null, count: 1 },
  ],
  materials: [
    { id: "doc_a", title: "Spectrum sharing — FCC briefing deck", kind: "briefing_deck", kindLabel: "Briefing Deck", meetingId: "a", meetingCode: "IVP-2026-041", reusable: true, addedAt: new Date("2026-08-20T15:30:00Z"), preview: "pdf", scheme: "seed", mime: "application/pdf" },
    { id: "doc_b", title: "Delegation list", kind: "participant_list", kindLabel: "Participant List", meetingId: "a", meetingCode: "IVP-2026-041", reusable: false, addedAt: new Date("2026-08-21T15:30:00Z"), preview: null, scheme: "link", mime: null },
  ],
  materialsTotal: 5,
  materialsHref: "/documents?countryCode=KE",
};

const NOW = new Date("2026-08-29T14:00:00Z");

function CountryDossier() {
  return (
    <div>
      <DossierHero flagCode="KE" eyebrow="Africa" title="Kenya" figures={dossier.figures} materialsHref={dossier.materialsHref} exportHref="/api/reports/export?report=history&countryCode=KE&as=xlsx" />
      <EngagementTimeline timeline={dossier.timeline} now={NOW} subject="Kenya" />
      <DossierSection id="country-briefers" title="FCC experts who have briefed them">
        <BriefersList briefers={dossier.briefers} />
      </DossierSection>
      <DossierSection id="country-materials" title="Materials">
        <MaterialsShelf materials={dossier.materials} total={dossier.materialsTotal} href={dossier.materialsHref} subject="Kenya" onOpen={vi.fn()} />
      </DossierSection>
    </div>
  );
}

function OrganizationDossier() {
  return (
    <div>
      <DossierHero flagCode="GB" eyebrow="Regulator · United Kingdom" title="Ofcom — Office of Communications" subtitle={<a href="https://www.ofcom.org.uk">ofcom.org.uk</a>} figures={{ ...dossier.figures, next: null }} materialsHref="/documents?orgId=ofcom" exportHref={null} />
      <EngagementTimeline timeline={{ lanes: [], meetings: [], firstFy: 2026, lastFy: 2026 }} now={NOW} subject="Ofcom" />
      <DossierSection id="org-briefers" title="FCC experts who have briefed them">
        <BriefersList briefers={[]} />
      </DossierSection>
      <DossierSection id="org-materials" title="Materials">
        <MaterialsShelf materials={[]} total={0} href="/documents?orgId=ofcom" subject="Ofcom" onOpen={vi.fn()} />
      </DossierSection>
    </div>
  );
}

describe("dossier accessibility", () => {
  it("a country dossier — hero, timeline, briefers, materials — carries no WCAG violations", async () => {
    const { container } = render(<CountryDossier />);
    await expectNoViolations(container);
  });

  it("an organization dossier with nothing on it yet carries no WCAG violations", async () => {
    const { container } = render(<OrganizationDossier />);
    await expectNoViolations(container);
  });
});
