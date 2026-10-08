// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { DossierHero } from "@/components/dossier/DossierHero";
import type { DossierFigures } from "@/lib/domain/dossier";

afterEach(cleanup);

const figures: DossierFigures = {
  engagements: 7,
  engagementsFy: 3,
  fy: 2026,
  participants: 54,
  firstAt: new Date("2023-02-14T15:00:00Z"),
  lastAt: new Date("2026-06-11T14:00:00Z"),
  next: { id: "mtg_next", code: "IVP-2026-041", start: new Date("2026-09-15T14:00:00Z"), status: "confirmed" },
};

describe("DossierHero", () => {
  it("names the subject and gives five figures, the next meeting linked to its record", () => {
    render(<DossierHero flagCode="KE" eyebrow="Africa" title="Kenya" figures={figures} materialsHref="/documents?countryCode=KE" exportHref="/api/reports/export?report=history&countryCode=KE&as=xlsx" />);
    expect(screen.getByRole("heading", { level: 1, name: "Kenya" })).toBeInTheDocument();
    expect(screen.getByText("Africa")).toBeInTheDocument();
    const list = screen.getByLabelText("Engagement figures");
    const terms = list.querySelectorAll("dt");
    expect([...terms].map((t) => t.textContent)).toEqual(["Engagements", "Participants", "First engaged", "Last engaged", "Next meeting"]);
    const values = [...list.querySelectorAll("dd")].map((d) => d.textContent);
    expect(values[0]).toBe("73 in FY26");
    expect(values[1]).toBe("54");
    expect(values[2]).toBe("Feb 14, 2023");
    expect(values[3]).toBe("Jun 11, 2026");
    expect(within(list).getByRole("link", { name: /Sep 15, 2026/ })).toHaveAttribute("href", "/meetings/mtg_next");
    expect(within(list).getByRole("link", { name: /Confirmed/ })).toBeInTheDocument();
  });

  it("offers the materials always and the export only to those who may report", () => {
    const { rerender } = render(<DossierHero flagCode="KE" eyebrow="Africa" title="Kenya" figures={figures} materialsHref="/documents?countryCode=KE" exportHref="/api/reports/export?report=history&countryCode=KE&as=xlsx" />);
    expect(screen.getByRole("link", { name: "All materials" })).toHaveAttribute("href", "/documents?countryCode=KE");
    expect(screen.getByRole("link", { name: "Export history" })).toHaveAttribute("href", "/api/reports/export?report=history&countryCode=KE&as=xlsx");
    rerender(<DossierHero flagCode="KE" eyebrow="Africa" title="Kenya" figures={figures} materialsHref="/documents?countryCode=KE" exportHref={null} />);
    expect(screen.queryByRole("link", { name: "Export history" })).toBeNull();
    expect(screen.getByRole("link", { name: "All materials" })).toBeInTheDocument();
  });

  it("stays honest when nothing has happened yet", () => {
    render(<DossierHero flagCode={null} eyebrow="Regulator · International" title="ITU" subtitle="itu.int" figures={{ engagements: 0, engagementsFy: 0, fy: 2026, participants: 0, firstAt: null, lastAt: null, next: null }} materialsHref="/documents?orgId=itu" exportHref={null} />);
    const values = [...screen.getByLabelText("Engagement figures").querySelectorAll("dd")].map((d) => d.textContent);
    expect(values).toEqual(["00 in FY26", "0", "—", "—", "None scheduled"]);
    expect(screen.getByText("itu.int")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
