// @vitest-environment node
import { nyDate } from "@/lib/domain/fiscal-year";
import { addNyDays, DAY_MS, type Span } from "@/lib/domain/reach-time";
import { canReplay, REPLAY_DAYS, REPLAY_LABELS, replayMonth, replayMs, replaySteps, replayStepWindow, replayWindow } from "@/lib/reach/replay";

// This year, calendar-exact: Jan 1, 2026 to Jan 1, 2027, 365 days (2026 is not a leap year).
const THIS_YEAR: Span = { from: nyDate(2026, 1, 1), to: nyDate(2027, 1, 1) };

describe("canReplay", () => {
  it("is false just under 90 days", () => {
    expect(canReplay({ from: nyDate(2026, 1, 1), to: nyDate(2026, 3, 31) })).toBe(false); // 89 days
  });

  it("is true at exactly 90 days", () => {
    expect(canReplay({ from: nyDate(2026, 1, 1), to: nyDate(2026, 4, 1) })).toBe(true); // 90 days
  });
});

describe("replayMs", () => {
  it("takes about 23.9 s to sweep this year", () => {
    expect(replayMs(THIS_YEAR)).toBeCloseTo(23_928.57, 1);
  });

  it("floors at 12 s for a 100-day span", () => {
    const span: Span = { from: nyDate(2026, 1, 1), to: nyDate(2026, 4, 11) }; // 100 days
    expect(replayMs(span)).toBe(12_000);
  });

  it("ceilings at 36 s for a 3-year span", () => {
    const span: Span = { from: nyDate(2024, 1, 1), to: nyDate(2027, 1, 1) };
    expect(replayMs(span)).toBe(36_000);
  });
});

describe("replayWindow", () => {
  it("starts the window at the span's start, 30 days wide", () => {
    const w = replayWindow(THIS_YEAR, 0);
    expect(w.from).toEqual(THIS_YEAR.from);
    expect(w.to.getTime() - w.from.getTime()).toBe(REPLAY_DAYS * DAY_MS);
  });

  it("ends the window exactly at the span's end at progress 1", () => {
    expect(replayWindow(THIS_YEAR, 1).to).toEqual(THIS_YEAR.to);
  });

  it("sits proportionally through the span's travel at progress 0.5", () => {
    const travel = THIS_YEAR.to.getTime() - THIS_YEAR.from.getTime() - REPLAY_DAYS * DAY_MS;
    const w = replayWindow(THIS_YEAR, 0.5);
    expect(w.from.getTime()).toBe(THIS_YEAR.from.getTime() + travel / 2);
    expect(w.to.getTime()).toBe(w.from.getTime() + REPLAY_DAYS * DAY_MS);
  });

  it("clamps progress outside 0..1", () => {
    expect(replayWindow(THIS_YEAR, -0.4)).toEqual(replayWindow(THIS_YEAR, 0));
    expect(replayWindow(THIS_YEAR, 1.7)).toEqual(replayWindow(THIS_YEAR, 1));
  });
});

describe("replaySteps", () => {
  it("counts the weekly steps across this year", () => {
    expect(replaySteps(THIS_YEAR)).toBe(48); // ceil((365 - 30) / 7)
  });
});

describe("replayStepWindow", () => {
  it("starts the first step at the span's start", () => {
    expect(replayStepWindow(THIS_YEAR, 0)).toEqual({ from: THIS_YEAR.from, to: addNyDays(THIS_YEAR.from, REPLAY_DAYS) });
  });

  it("ends the last step exactly at the span's end", () => {
    const last = replaySteps(THIS_YEAR);
    const w = replayStepWindow(THIS_YEAR, last);
    expect(w.to).toEqual(THIS_YEAR.to);
    expect(w.from.getTime()).toBeLessThan(THIS_YEAR.to.getTime());
    expect(w.from).toEqual(addNyDays(THIS_YEAR.from, last * 7));
  });
});

describe("REPLAY_LABELS", () => {
  it("names every range", () => {
    expect(REPLAY_LABELS).toEqual({
      all: "Replaying every meeting",
      last: "Replaying last year",
      this: "Replaying this year",
      next365: "Replaying the next 365 days",
      next30: "Replaying",
      next7: "Replaying",
    });
  });
});

describe("replayMonth", () => {
  it("names the Washington month at the window's middle", () => {
    expect(replayMonth({ from: nyDate(2026, 3, 1), to: nyDate(2026, 3, 31) })).toBe("Mar 2026");
  });

  it("can land in the following month once the middle crosses the boundary", () => {
    expect(replayMonth({ from: nyDate(2026, 3, 20), to: nyDate(2026, 4, 19) })).toBe("Apr 2026");
  });
});
