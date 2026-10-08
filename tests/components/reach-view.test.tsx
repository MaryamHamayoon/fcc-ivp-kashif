// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { URL_THROTTLE_MS, useReachView } from "@/components/reach/useReachView";
import { nyDate } from "@/lib/domain/fiscal-year";
import { DEFAULT_VIEW, type ReachView } from "@/lib/reach/url";
import { makeReachData, makeReachMeeting } from "@/tests/fixtures/reach";

/** The query Next's router says the address bar holds: none outside the router, as in the other component tests. */
const nav = vi.hoisted(() => ({ params: null as URLSearchParams | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));

const DATA = makeReachData([makeReachMeeting({ id: "mtg_kept" })]);
const narrowed = (day: number): ReachView => ({ ...DEFAULT_VIEW, window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 3, day) } });

beforeEach(() => {
  nav.params = null;
  window.history.replaceState(null, "", "/reach");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => vi.useRealTimers());

describe("useReachView", () => {
  it("starts from the view the server parsed, and writes each change into the URL without navigating", () => {
    const { result } = renderHook(() => useReachView(DEFAULT_VIEW, DATA));
    expect(result.current[0]).toBe(DEFAULT_VIEW);
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current[1]({ ...DEFAULT_VIEW, range: "next30", tab: "countries" }));
    expect(result.current[0].range).toBe("next30");
    expect(window.location.search).toBe("?range=next30&tab=countries");
    expect(push).not.toHaveBeenCalled(); // Back leaves the page rather than stepping through every filter
  });

  it("opens on the view in the address bar, since Back restores the page from the router's cache with the view it first loaded", () => {
    nav.params = new URLSearchParams("meeting=mtg_kept&range=next30&format=in_person");
    const { result } = renderHook(() => useReachView(DEFAULT_VIEW, DATA));
    expect(result.current[0]).toMatchObject({ range: "next30", filters: { formats: ["in_person"] }, selection: { kind: "meeting", id: "mtg_kept" } });
    act(() => result.current[1]((view) => ({ ...view, tab: "countries" }))); // and the next change builds on it
    expect(window.location.search).toBe("?meeting=mtg_kept&range=next30&format=in_person&tab=countries");
  });

  it("drops a selection in the address bar that the payload cannot answer", () => {
    nav.params = new URLSearchParams("meeting=mtg_gone&range=next30");
    const { result } = renderHook(() => useReachView(DEFAULT_VIEW, DATA));
    expect(result.current[0]).toMatchObject({ range: "next30", selection: null });
  });

  it("builds each change on the latest view, so two in one event both stick", () => {
    const { result } = renderHook(() => useReachView(DEFAULT_VIEW, DATA));
    act(() => {
      result.current[1]((view) => ({ ...view, range: "next7" }));
      result.current[1]((view) => ({ ...view, tab: "countries" }));
    });
    expect(result.current[0]).toMatchObject({ range: "next7", tab: "countries" });
    expect(window.location.search).toBe("?range=next7&tab=countries");
  });

  it("writes a drag at most every 250 ms, and the drag's end at once", () => {
    const { result } = renderHook(() => useReachView(DEFAULT_VIEW, DATA));
    const replace = vi.spyOn(window.history, "replaceState");
    act(() => {
      result.current[1](narrowed(10), { live: true });
      result.current[1](narrowed(12), { live: true });
      result.current[1](narrowed(14), { live: true });
    });
    expect(result.current[0]).toEqual(narrowed(14)); // the view follows every step
    expect(replace).toHaveBeenCalledTimes(1); // the first step writes; the next two wait
    act(() => vi.advanceTimersByTime(URL_THROTTLE_MS));
    expect(replace).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("?range=this&from=2026-03-01&to=2026-03-13");

    act(() => result.current[1](narrowed(20), { live: true }));
    act(() => result.current[1](narrowed(21))); // the drag ends: written now, the pending write dropped
    expect(window.location.search).toBe("?range=this&from=2026-03-01&to=2026-03-20");
    const calls = replace.mock.calls.length;
    act(() => vi.advanceTimersByTime(URL_THROTTLE_MS * 2));
    expect(replace).toHaveBeenCalledTimes(calls);
  });
});
