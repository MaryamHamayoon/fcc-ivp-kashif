// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MAP_LABEL, ReachMap, type ReachMapHandle, type ReachMapProps, TIP_GRACE_MS, tipPlacement } from "@/components/geo/ReachMap";
import { TILE_PATIENCE_MS } from "@/lib/geo/reach-engine";
import { LAYERS } from "@/lib/geo/reach-style";
import { FakeMap } from "@/tests/fixtures/fake-maplibre";
import { KENYA, MAP_MARKS, MAP_RAMP, MAP_THEME } from "@/tests/fixtures/map";

const webgl = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/geo/webgl", () => ({ webgl2Available: () => webgl.value }));
const reduce = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/motion", () => ({ useReducedMotion: () => reduce.value, reducedMotionNow: () => reduce.value, motionTransition: (t: unknown) => (reduce.value ? { duration: 0 } : t) }));
vi.mock("maplibre-gl", async () => (await import("@/tests/fixtures/fake-maplibre")).fakeMapLibre);
vi.mock("@/lib/geo/shapes", async () => {
  const { MAP_SHAPES } = await import("@/tests/fixtures/map");
  return { loadShapes: async () => MAP_SHAPES };
});

/** The IntersectionObserver the map creates, so a test can scroll it out of view. */
const seen = vi.hoisted(() => ({ observers: [] as IntersectionObserverCallback[] }));
class ObserverDouble {
  constructor(callback: IntersectionObserverCallback) {
    seen.observers.push(callback);
  }
  observe() {}
  disconnect() {}
}

function renderMap(over: Partial<ReachMapProps> = {}) {
  const onSelect = vi.fn();
  const view = render(
    <ReachMap mode="preview" theme={MAP_THEME} marks={MAP_MARKS} ramp={MAP_RAMP} signals="moving" renderTip={(cca2) => <span>About {cca2}</span>} onSelect={onSelect} fallback={<p>The same countries, as a list.</p>} {...over} />,
  );
  return { ...view, onSelect };
}

/** Waits for MapLibre to arrive, then lets the map draw its own land and marks. */
async function mapReady(): Promise<FakeMap> {
  const map = await waitFor(() => {
    if (!FakeMap.last) throw new Error("no map yet");
    return FakeMap.last;
  });
  act(() => {
    map.loadStyle();
    map.drawOwnSources();
  });
  return map;
}

const pointAt = (map: FakeMap, cca2: string | null) =>
  act(() => {
    map.hits = cca2 ? { [LAYERS.glyph]: [{ properties: { cca2 } }] } : {};
    map.fire("mousemove", { point: { x: 1, y: 1 } });
  });

beforeEach(() => {
  webgl.value = true;
  reduce.value = false;
  FakeMap.last = null;
  seen.observers.length = 0;
  vi.stubGlobal("IntersectionObserver", ObserverDouble);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReachMap", () => {
  it("shows the list instead when this browser cannot draw the map", async () => {
    webgl.value = false;
    renderMap();
    expect(screen.getByText("The same countries, as a list.")).toBeInTheDocument();
    await act(async () => {});
    expect(FakeMap.last).toBeNull();
  });

  it("holds a skeleton until its own land and marks have drawn, then fades the map in", async () => {
    const { container } = renderMap();
    expect(screen.getByText("Loading the map…")).toBeInTheDocument();
    await mapReady();
    expect(screen.queryByText("Loading the map…")).toBeNull();
    expect(container.querySelector(".opacity-100")).not.toBeNull();
  });

  it("names the map for screen readers and ties it to the sentence that describes it", async () => {
    renderMap({ describedBy: "reach-sentence" });
    const map = await mapReady();
    expect(map.getCanvas()).toHaveAttribute("aria-label", MAP_LABEL);
    expect(map.getCanvas()).toHaveAttribute("aria-describedby", "reach-sentence");
  });

  it("hands new data to the map without rebuilding it", async () => {
    const { rerender } = renderMap();
    const map = await mapReady();
    rerender(<ReachMap mode="preview" theme={MAP_THEME} marks={[KENYA]} ramp={MAP_RAMP} signals="moving" renderTip={() => null} onSelect={() => {}} fallback={null} />);
    expect(map.getSource("marks")?.setData).toHaveBeenCalledOnce();
    expect(map.styleCalls).toHaveLength(0);
  });

  it("shows a country's tooltip beside its mark, and Escape closes it", async () => {
    const user = userEvent.setup();
    renderMap();
    const map = await mapReady();
    pointAt(map, "JP");
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("About JP");
    expect(Number.parseFloat(tip.style.top)).toBeGreaterThan(35.7); // Japan's mark sits near the top: the tooltip opens beneath it
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the tooltip while the pointer travels onto it, and lets it go after", async () => {
    renderMap();
    const map = await mapReady();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    pointAt(map, "JP");
    pointAt(map, null);
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(TIP_GRACE_MS * 2));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("tooltip"));
    expect(screen.queryByRole("tooltip")).toBeNull();

    pointAt(map, "BR");
    pointAt(map, null);
    act(() => vi.advanceTimersByTime(TIP_GRACE_MS));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("chooses a country with a click, and shows the selection it is given", async () => {
    const { onSelect } = renderMap({ selected: "KE" });
    const map = await mapReady();
    expect(map.stateOf("shapes", 404)).toMatchObject({ selected: true });
    act(() => {
      map.hits = { [LAYERS.glyph]: [{ properties: { cca2: "JP" } }] };
      map.fire("click", { point: { x: 1, y: 1 } });
    });
    expect(onSelect).toHaveBeenCalledWith("JP");
  });

  it("takes camera moves through its handle, even before the map exists", async () => {
    const ref = createRef<ReachMapHandle>();
    renderMap({ ref });
    act(() => ref.current?.move({ kind: "country", cca2: "JP" }));
    const map = await mapReady();
    expect((map.options.center as [number, number])[0]).toBeCloseTo(136, 0); // opened on Japan's main islands
    act(() => ref.current?.move({ kind: "world" }));
    expect(map.camera.at(-1)?.[0]).toBe("flyTo");
    reduce.value = true;
    act(() => ref.current?.move({ kind: "country", cca2: "BR" }));
    expect(map.camera.at(-1)?.[0]).toBe("jumpTo"); // reduced motion, asked at the moment of the move
    expect(ref.current?.camera()).toEqual({ kind: "country", cca2: "BR" });
  });

  it("stops the rings while the map is scrolled out of view", async () => {
    renderMap();
    await mapReady();
    expect(requestAnimationFrame).toHaveBeenCalled();
    act(() => seen.observers[0]?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("says when the map's details have not arrived", async () => {
    renderMap();
    await mapReady();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(screen.queryByText(/Map details unavailable/)).toBeNull();
    // The engine started its wait when the style loaded, before these fake timers: start a fresh one.
    act(() => FakeMap.last?.loadStyle());
    act(() => vi.advanceTimersByTime(TILE_PATIENCE_MS));
    expect(screen.getByText(/Map details unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "© OpenStreetMap" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  });
});

describe("tipPlacement", () => {
  const at = (x: number, y: number, r = 10) => ({ cca2: "JP", x, y, r });

  it("sits centered above the mark, clear of it", () => {
    expect(tipPlacement(at(400, 300), 800)).toEqual({ cca2: "JP", left: 400, top: 280, below: false });
  });

  it("opens beneath a mark near the top", () => {
    expect(tipPlacement(at(400, 100), 800)).toMatchObject({ top: 120, below: true });
  });

  it("stays inside the map at its edges", () => {
    expect(tipPlacement(at(20, 300), 800).left).toBe(136);
    expect(tipPlacement(at(790, 300), 800).left).toBe(664);
  });

  it("keeps clear of the panels", () => {
    const panels = { top: 76, right: 392, bottom: 196, left: 320 };
    expect(tipPlacement(at(350, 300), 1440, panels).left).toBe(456);
    expect(tipPlacement(at(700, 200), 1440, panels).below).toBe(true);
  });
});
