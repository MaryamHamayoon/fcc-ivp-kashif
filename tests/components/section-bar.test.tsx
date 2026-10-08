// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { BellRing } from "lucide-react";
import { SectionBar } from "@/components/common/SectionBar";

afterEach(cleanup);

describe("SectionBar", () => {
  it("names the section in a heading of the level asked for, under the id the section is labelled by", () => {
    // The icon arrives drawn, not as a component: a server page can hand an element to a client
    // figure, and cannot hand it a function.
    render(<SectionBar title="Needs attention" titleId="attention-heading" icon={<BellRing data-testid="icon" />} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Needs attention" });
    expect(heading).toHaveAttribute("id", "attention-heading");
    // The icon is decoration: the name is already in words.
    expect(screen.getByTestId("icon").closest('[aria-hidden="true"]')).not.toBeNull();
    expect(heading.closest("header")).toContainElement(screen.getByTestId("icon"));
  });

  it("sets a count and a short note beside the name, outside it, so the section's name stays the name", () => {
    render(<SectionBar title="Global reach" count={28} note="11 countries" />);
    const bar = within(screen.getByRole("heading", { name: "Global reach" }).closest("header") as HTMLElement);
    expect(bar.getByText("28")).toBeInTheDocument();
    expect(bar.getByText("11 countries")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Global reach" })).toHaveTextContent(/^Global reach$/);
  });

  it("holds the section's filters and controls in the same bar", () => {
    render(
      <SectionBar title="Global reach">
        <button type="button">List</button>
      </SectionBar>,
    );
    const bar = screen.getByRole("heading", { name: "Global reach" }).closest("header") as HTMLElement;
    expect(within(bar).getByRole("button", { name: "List" })).toBeInTheDocument();
  });

  it("says which surface it sits on, so the program band's bar can wear the band's own ink", () => {
    const { rerender } = render(<SectionBar title="Topics" />);
    expect(screen.getByRole("heading", { name: "Topics" }).closest("header")).toHaveAttribute("data-tone", "card");
    rerender(<SectionBar title="Program at a glance" tone="band" note="FY26" />);
    expect(screen.getByRole("heading", { name: "Program at a glance" }).closest("header")).toHaveAttribute("data-tone", "band");
  });

  it("is the caption when the section is a figure, with the title a step further down the outline", () => {
    render(
      <figure>
        <SectionBar as="figcaption" level={3} title="Topics" />
      </figure>,
    );
    expect(document.querySelector("figcaption")).toContainElement(screen.getByRole("heading", { level: 3, name: "Topics" }));
  });
});
