// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { usePresence } from "@/components/reach/usePresence";

/** A surface with two controls of its own, and one control outside it. */
function Probe() {
  const [present, handlers] = usePresence();
  return (
    <>
      <div data-testid="surface" data-present={present} {...handlers}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

const surface = () => screen.getByTestId("surface");
const present = () => surface().dataset.present === "true";
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePresence", () => {
  it("counts the pointer while it is over the surface and for 300 ms after it leaves; coming back in time cancels the countdown", () => {
    render(<Probe />);
    expect(present()).toBe(false);
    fireEvent.pointerEnter(surface());
    expect(present()).toBe(true);

    fireEvent.pointerLeave(surface());
    wait(299);
    expect(present()).toBe(true);
    fireEvent.pointerEnter(surface());
    wait(300);
    expect(present()).toBe(true);

    fireEvent.pointerLeave(surface());
    wait(300);
    expect(present()).toBe(false);
  });

  it("counts a press that began on the surface until it is let go, wherever the pointer is by then", () => {
    render(<Probe />);
    fireEvent.pointerEnter(surface());
    fireEvent.pointerDown(surface());
    fireEvent.pointerLeave(surface());
    wait(1000);
    expect(present()).toBe(true);
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outside" }));
    expect(present()).toBe(false);

    // A press the browser takes over, as when a touch turns into a scroll, ends too.
    fireEvent.pointerDown(surface());
    expect(present()).toBe(true);
    fireEvent.pointerCancel(surface());
    expect(present()).toBe(false);
  });

  it("counts focus anywhere inside the surface, and keeps counting it while focus moves from one of its controls to the next", () => {
    render(<Probe />);
    const first = within(surface()).getByRole("button", { name: "First" });
    const second = within(surface()).getByRole("button", { name: "Second" });
    act(() => first.focus());
    expect(present()).toBe(true);
    // Focus leaves one control before it arrives on the next, and the page can render in between.
    fireEvent.focusOut(first, { relatedTarget: second });
    expect(present()).toBe(true);
    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    expect(present()).toBe(false);
  });
});
