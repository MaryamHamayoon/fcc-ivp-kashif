// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { CountryTip, type TipCountry } from "@/components/geo/CountryTip";

afterEach(cleanup);

const JAPAN: TipCountry = {
  cca2: "JP",
  name: "Japan",
  region: "Asia-Pacific",
  count: 3,
  participants: 41,
  mix: { in_person: 2, hybrid: 1, virtual: 0 },
  next: { orgName: "Ministry of Internal Affairs and Communications", start: new Date("2026-10-14T14:00:00Z"), proposed: false, format: "in_person" },
};

describe("CountryTip", () => {
  it("names the country and its region, then its meetings and participants", () => {
    render(<CountryTip country={JAPAN} />);
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("Asia-Pacific")).toBeInTheDocument();
    expect(screen.getByText(/3 meetings/)).toHaveTextContent("3 meetings · 41 participants");
  });

  it("breaks the meetings down by format, glyph and word, leaving out a format with none", () => {
    const { container } = render(<CountryTip country={JAPAN} />);
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["2In person", "1Hybrid"]);
    expect([...container.querySelectorAll("svg[data-format]")].map((svg) => svg.getAttribute("data-format"))).toEqual(["in_person", "hybrid"]);
  });

  it("names the next visit, and says when its date is only proposed", () => {
    const { rerender } = render(<CountryTip country={JAPAN} />);
    expect(screen.getByText(/^Next:/)).toHaveTextContent("Next: Ministry of Internal Affairs and Communications, Oct 14 · In person");
    rerender(<CountryTip country={{ ...JAPAN, next: { ...JAPAN.next!, proposed: true } }} />);
    expect(screen.getByText(/^Next:/)).toHaveTextContent("Oct 14 (proposed) · In person");
    rerender(<CountryTip country={{ ...JAPAN, next: null }} />);
    expect(screen.queryByText(/^Next:/)).toBeNull();
  });
});
