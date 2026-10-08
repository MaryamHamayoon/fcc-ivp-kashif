// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { FormatBreakdown, FormatGlyph } from "@/components/geo/FormatGlyph";

afterEach(cleanup);

const circles = (container: HTMLElement) => [...container.querySelectorAll("circle")];

describe("FormatGlyph", () => {
  it("draws in person as a solid disc", () => {
    const { container } = render(<FormatGlyph format="in_person" size={10} />);
    const [disc, ...rest] = circles(container);
    expect(rest).toHaveLength(0);
    expect(disc).toHaveAttribute("r", "5");
    expect(disc).toHaveAttribute("fill", "var(--chart-2)");
    expect(disc).not.toHaveAttribute("stroke");
  });

  it("draws hybrid as a ring around a core at 46% of the radius", () => {
    const { container } = render(<FormatGlyph format="hybrid" size={10} />);
    const [ring, core] = circles(container);
    expect(ring).toHaveAttribute("fill", "none");
    expect(ring).toHaveAttribute("stroke", "var(--chart-3)");
    expect(Number(core?.getAttribute("r"))).toBeCloseTo(2.3);
    expect(core).toHaveAttribute("fill", "var(--chart-3)");
  });

  it("draws virtual as an open ring, its rim inside the box", () => {
    const { container } = render(<FormatGlyph format="virtual" size={10} />);
    const [ring, ...rest] = circles(container);
    expect(rest).toHaveLength(0);
    expect(ring).toHaveAttribute("fill", "none");
    expect(ring).toHaveAttribute("stroke", "var(--chart-1)");
    // rim 1.8 (18% of 10), centered on r - rim/2 so its outer edge meets the box
    expect(Number(ring?.getAttribute("r")) + Number(ring?.getAttribute("stroke-width")) / 2).toBeCloseTo(5);
  });

  it("is decorative: hidden from assistive technology and never a tab stop", () => {
    const { container } = render(<FormatGlyph format="virtual" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("width", "10");
  });
});

describe("FormatBreakdown", () => {
  it("tells each format by glyph, number and word, in person first, leaving out a format with none", () => {
    const { container } = render(<FormatBreakdown mix={{ in_person: 0, hybrid: 1, virtual: 3 }} />);
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["1Hybrid", "3Virtual"]);
    expect([...container.querySelectorAll("svg[data-format]")].map((svg) => svg.getAttribute("data-format"))).toEqual(["hybrid", "virtual"]);
  });
});
