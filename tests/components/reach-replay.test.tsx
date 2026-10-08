// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplayButton, ReplayCaption } from "@/components/reach/Replay";
import { useReplay } from "@/components/reach/useReplay";
import { nyDate } from "@/lib/domain/fiscal-year";
import type { Span } from "@/lib/domain/reach-time";
import { replayMs, replaySteps, replayStepWindow, replayWindow } from "@/lib/reach/replay";

// This year, calendar-exact: 365 days, so replayMs lands mid-range (not floored or ceilinged).
const THIS_YEAR: Span = { from: nyDate(2026, 1, 1), to: nyDate(2027, 1, 1) };
// Exactly the 90-day floor, so replayMs is the 12 s floor and the reduced-motion math stays small.
const NINETY_DAYS: Span = { from: nyDate(2026, 1, 1), to: nyDate(2026, 4, 1) };

/** A manual `requestAnimationFrame` driver: `fire` runs the oldest queued callback. */
function mockRaf() {
  const queue: FrameRequestCallback[] = [];
  const raf = vi.fn((cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    cancel,
    fire(now: number) {
      const next = queue.shift();
      next?.(now);
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useReplay: moving mode", () => {
  it("starts at the range's start and begins playing", () => {
    mockRaf();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false }));
    act(() => result.current.start());
    expect(result.current.playing).toBe(true);
    expect(result.current.window).toEqual(replayWindow(THIS_YEAR, 0));
  });

  it("moves the window forward each frame, capping a stalled frame's delta at 100ms", () => {
    const driver = mockRaf();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false }));
    act(() => result.current.start());

    // Accumulated the same way `useReplay` accumulates it (successive +=), so floating-point
    // rounding can never make an independently-computed expectation disagree by a stray µs.
    const duration = replayMs(THIS_YEAR);
    let progress = 0;

    act(() => driver.fire(1_000)); // the first frame only sets the clock's baseline
    expect(result.current.window).toEqual(replayWindow(THIS_YEAR, progress));

    act(() => driver.fire(1_050)); // 50ms later, under the cap
    progress += 50 / duration;
    expect(result.current.window).toEqual(replayWindow(THIS_YEAR, progress));

    act(() => driver.fire(1_200)); // 150ms later: clamped to 100ms of progress
    progress += 100 / duration;
    expect(result.current.window).toEqual(replayWindow(THIS_YEAR, progress));
  });

  it("pause stops where it is, returns that window, and cancels the frame", () => {
    const driver = mockRaf();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false }));
    act(() => result.current.start());
    act(() => driver.fire(1_000));
    act(() => driver.fire(1_080));
    const atPause = result.current.window;

    let returned: Span | null = null;
    act(() => {
      returned = result.current.pause();
    });
    expect(returned).toEqual(atPause);
    expect(result.current.playing).toBe(false);
    expect(result.current.window).toBeNull();
    expect(driver.cancel).toHaveBeenCalled();
  });

  it("pause returns null when Replay was never started", () => {
    mockRaf();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false }));
    let returned: Span | null = null;
    act(() => {
      returned = result.current.pause();
    });
    expect(returned).toBeNull();
  });

  it("reaching the end clears the window, stops playing, and calls onEnd", () => {
    const driver = mockRaf();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useReplay({ span: NINETY_DAYS, reduce: false, onEnd }));
    act(() => result.current.start());

    const ms = replayMs(NINETY_DAYS); // the 12 s floor
    let t = 0;
    act(() => driver.fire(t)); // baseline frame
    const ticks = Math.ceil(ms / 100) + 1; // one more than needed, to cross progress 1
    for (let i = 0; i < ticks; i++) {
      t += 100;
      act(() => driver.fire(t));
    }

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe(false);
    expect(result.current.window).toBeNull();
  });

  it("stops without calling onEnd or returning anything", () => {
    const driver = mockRaf();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false, onEnd }));
    act(() => result.current.start());
    act(() => driver.fire(1_000));
    act(() => driver.fire(1_050));

    act(() => result.current.stop());
    expect(result.current.playing).toBe(false);
    expect(result.current.window).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    expect(driver.cancel).toHaveBeenCalled();
  });

  it("stops when the span changes while playing", () => {
    mockRaf();
    const { result, rerender } = renderHook(({ span }: { span: Span }) => useReplay({ span, reduce: false }), { initialProps: { span: THIS_YEAR } });
    act(() => result.current.start());
    expect(result.current.playing).toBe(true);

    rerender({ span: NINETY_DAYS });
    expect(result.current.playing).toBe(false);
    expect(result.current.window).toBeNull();
  });

  it("cancels the frame on unmount", () => {
    const driver = mockRaf();
    const { result, unmount } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: false }));
    act(() => result.current.start());
    unmount();
    expect(driver.cancel).toHaveBeenCalled();
  });
});

describe("useReplay: reduced motion", () => {
  beforeEach(() => vi.useFakeTimers());

  it("steps a week at a time, once per interval, and ends on the tick past the last step", () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: true, onEnd }));
    act(() => result.current.start());
    expect(result.current.window).toEqual(replayWindow(THIS_YEAR, 0));

    const steps = replaySteps(THIS_YEAR);
    const interval = replayMs(THIS_YEAR) / steps;

    for (let step = 1; step <= steps; step++) {
      act(() => vi.advanceTimersByTime(interval));
      expect(result.current.window).toEqual(replayStepWindow(THIS_YEAR, step));
    }
    expect(result.current.playing).toBe(true); // the last step is shown; the timer isn't done yet

    act(() => vi.advanceTimersByTime(interval)); // one tick past the last step ends it
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe(false);
    expect(result.current.window).toBeNull();
  });

  it("cancels the timer on unmount", () => {
    const { result, unmount } = renderHook(() => useReplay({ span: THIS_YEAR, reduce: true }));
    act(() => result.current.start());
    const cleared = vi.spyOn(globalThis, "clearInterval");
    unmount();
    expect(cleared).toHaveBeenCalled();
  });
});

describe("ReplayButton", () => {
  it("reads Replay and starts it when clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onPause = vi.fn();
    render(<ReplayButton playing={false} onStart={onStart} onPause={onPause} />);
    const button = screen.getByRole("button", { name: "Replay" });
    expect(button).not.toHaveAttribute("aria-pressed");
    await user.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
  });

  it("reads Pause and pauses it when clicked, while playing", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onPause = vi.fn();
    render(<ReplayButton playing onStart={onStart} onPause={onPause} />);
    const button = screen.getByRole("button", { name: "Pause" });
    expect(button).not.toHaveAttribute("aria-pressed");
    await user.click(button);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("ReplayCaption", () => {
  it("names the range's story and the window's middle month, hidden from assistive tech", () => {
    const { container } = render(<ReplayCaption range="this" window={{ from: nyDate(2026, 3, 1), to: nyDate(2026, 3, 31) }} />);
    expect(screen.getByText("Replaying this year")).toBeInTheDocument();
    expect(screen.getByText("Mar 2026")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("names every range's own story", () => {
    render(<ReplayCaption range="next365" window={{ from: nyDate(2026, 3, 1), to: nyDate(2026, 3, 31) }} />);
    expect(screen.getByText("Replaying the next 365 days")).toBeInTheDocument();
  });
});
