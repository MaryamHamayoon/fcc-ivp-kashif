// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";

const tabs: ScopeTab[] = [
  { id: "active", label: "Active", href: "/meetings", active: true },
  { id: "upcoming", label: "Upcoming", href: "/meetings?view=upcoming", active: false },
  { id: "all", label: "All", href: "/meetings?view=all", active: false },
];

/** jsdom never lays anything out, so the geometry `useScrollEdges` reads has to be defined by
 * hand before each scroll it should react to. */
function setGeometry(el: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: scrollLeft, configurable: true });
}

afterEach(cleanup);

describe("useScrollEdges (via ScopeTabs)", () => {
  it("carries no fade until the strip overflows, then fades only the side still hidden", () => {
    render(<ScopeTabs label="Scope" tabs={tabs} />);
    const nav = screen.getByRole("navigation", { name: "Scope" });

    // Nothing overflows yet — jsdom's default 0/0/0 geometry reports nothing hidden either side.
    expect(nav).not.toHaveAttribute("data-fade");

    setGeometry(nav, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).toHaveAttribute("data-fade", "end");

    setGeometry(nav, { scrollWidth: 300, clientWidth: 100, scrollLeft: 100 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).toHaveAttribute("data-fade", "both");

    setGeometry(nav, { scrollWidth: 300, clientWidth: 100, scrollLeft: 200 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(nav).toHaveAttribute("data-fade", "start");
  });
});
