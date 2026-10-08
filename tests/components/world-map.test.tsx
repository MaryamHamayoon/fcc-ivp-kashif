// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldMap } from "@/components/dashboard/map/WorldMap";
import { cardRange } from "@/lib/domain/reach";
import { CAMERA_MS } from "@/lib/geo/reach-engine";
import { LAYERS } from "@/lib/geo/reach-style";
import type { ReachCard } from "@/lib/services/dashboard";
import { FakeMap } from "@/tests/fixtures/fake-maplibre";
import { makeReachData, makeReachMeeting, REACH_NOW } from "@/tests/fixtures/reach";

/* --------------------------------- doubles -------------------------------- */

const webgl = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/geo/webgl", () => ({ webgl2Available: () => webgl.value }));
const reduce = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/motion", () => ({ useReducedMotion: () => reduce.value, reducedMotionNow: () => reduce.value, motionTransition: (t: unknown) => (reduce.value ? { duration: 0 } : t) }));
vi.mock("maplibre-gl", async () => (await import("@/tests/fixtures/fake-maplibre")).fakeMapLibre);
vi.mock("@/lib/geo/shapes", async () => {
  const { MAP_SHAPES } = await import("@/tests/fixtures/map");
  return { loadShapes: async () => MAP_SHAPES };
});

/* --------------------------------- fixtures ------------------------------- */

const at = (iso: string) => new Date(iso);
const DATA = makeReachData([
  makeReachMeeting({ id: "mtg_jp", countries: ["JP"], start: at("2026-10-01T14:00:00Z"), format: "hybrid", participants: 12 }),
  makeReachMeeting({ countries: ["JP"], start: at("2026-11-20T14:00:00Z") }),
  makeReachMeeting({ countries: ["KE"], region: "Africa", start: at("2026-10-08T14:00:00Z"), format: "virtual", orgName: "Communications Authority of Kenya" }),
  makeReachMeeting({ countries: ["BR"], region: "Americas", start: at("2026-03-10T14:00:00Z") }),
  makeReachMeeting({ countries: ["DE"], region: "Europe", start: at("2026-12-01T14:00:00Z"), proposed: true }),
]);

const REGIONS: ReachCard["regions"] = [
  { name: "Africa", bounds: [[-18, -35], [52, 38]] },
  { name: "Americas", bounds: [[-118, -56], [-34, 60]] },
  { name: "Asia-Pacific", bounds: [[68, -48], [180, 50]] },
  { name: "Europe", bounds: [[-25, 34], [45, 72]] },
];

/** Next 30 days: Japan and Kenya. This year: Japan (2), Brazil, Germany and Kenya. */
const REACH: ReachCard = { next30: cardRange(DATA, "next30", REACH_NOW), thisYear: cardRange(DATA, "this", REACH_NOW), regions: REGIONS };

/* ---------------------------------- setup --------------------------------- */

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

/** The fact beside the section's name. */
const note = () => (screen.getByRole("heading", { name: "Global reach" }).closest("header") as HTMLElement).querySelector('[data-slot="section-note"]')?.textContent;

/** Opens the Region menu by the name its button has just now, and picks a row. */
async function pickRegion(button: string, row: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: button }));
  await userEvent.click(await screen.findByRole("button", { name: row }));
}

const pointAt = (map: FakeMap, cca2: string) =>
  act(() => {
    map.hits = { [LAYERS.glyph]: [{ properties: { cca2 } }] };
    map.fire("mousemove", { point: { x: 1, y: 1 } });
  });

beforeEach(() => {
  webgl.value = true;
  reduce.value = false;
  FakeMap.last = null;
  window.localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ---------------------------------- tests --------------------------------- */

describe("Global reach card", () => {
  it("opens on the next 30 days, counting its countries, with the full screen one click away on the same range", async () => {
    render(<WorldMap reach={REACH} />);
    await mapReady();
    expect(note()).toBe("2 countries");
    expect(screen.getByRole("button", { name: "Next 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Full screen" })).toHaveAttribute("href", "/reach?range=next30");
  });

  it("counts this year when asked, and hands the map the new range without rebuilding it", async () => {
    render(<WorldMap reach={REACH} />);
    const map = await mapReady();
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(note()).toBe("4 countries");
    expect(screen.getByRole("link", { name: "Full screen" })).toHaveAttribute("href", "/reach?range=this");
    const [features] = map.getSource("marks")?.setData.mock.lastCall ?? [];
    expect((features as GeoJSON.FeatureCollection).features.map((f) => f.properties?.cca2)).toEqual(["JP", "BR", "DE", "KE"]);
    expect(map.styleCalls).toHaveLength(0);
  });

  it("flies to a region's countries with meetings, or to the whole region when it has none, and the fact follows", async () => {
    render(<WorldMap reach={REACH} />);
    const map = await mapReady();

    await pickRegion("Region", /^Asia-Pacific/);
    expect(note()).toBe("1 country");
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.bounds })]);
    expect(screen.getByRole("link", { name: "Full screen" })).toHaveAttribute("href", "/reach?range=next30&region=Asia-Pacific");

    // Nothing in Europe in the next 30 days: the camera frames the region itself, and the fact says so.
    await pickRegion("Region Asia-Pacific", /^Europe/);
    expect(note()).toBe("0 countries");
    expect(map.camera.at(-1)?.[1]).toMatchObject({ duration: CAMERA_MS.bounds });

    await pickRegion("Region Europe", /^World/);
    expect(note()).toBe("2 countries");
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.world })]);
  });

  it("describes the map in one sentence tied to it, rebuilt from the range's numbers", async () => {
    render(<WorldMap reach={REACH} />);
    const map = await mapReady();
    const sentence = document.getElementById(map.getCanvas().getAttribute("aria-describedby") ?? "");
    expect(sentence).toHaveTextContent("Next 30 days: 2 meetings in 2 countries. Most: Japan 1, Kenya 1. 2 countries have a meeting coming up in the next 30 days.");
  });

  it("names a country on hover and opens its panel on a click; Escape closes the tooltip first, then the panel", async () => {
    render(<WorldMap reach={REACH} />);
    const map = await mapReady();
    pointAt(map, "JP");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Japan");
    expect(screen.getByRole("tooltip")).toHaveTextContent("1 meeting · 12 participants");

    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    const panel = within(await screen.findByRole("complementary", { name: "Japan" }));
    expect(panel.getByText("Asia-Pacific · Next 30 days")).toBeInTheDocument();
    expect(panel.getByText(/^1 meeting/)).toHaveTextContent("1 meeting · 12 participants");
    expect(panel.getByRole("link", { name: /Ministry of Internal Affairs/ })).toHaveAttribute("href", "/meetings/mtg_jp");
    expect(panel.getByRole("link", { name: /Ministry of Internal Affairs/ })).toHaveTextContent("Oct 1, 2026 · Hybrid");
    expect(panel.getByRole("link", { name: "Open in full screen" })).toHaveAttribute("href", "/reach?country=JP&range=next30");
    expect(panel.getByRole("link", { name: "Open Japan" })).toHaveAttribute("href", "/countries/JP");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Japan" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Japan" })).toBeNull());
  });

  it("lets go of a country the new range does not count", async () => {
    render(<WorldMap reach={REACH} />);
    const map = await mapReady();
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    pointAt(map, "DE");
    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(await screen.findByRole("complementary", { name: "Germany" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next 30 days" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Germany" })).toBeNull());
  });

  it("keeps its list twin: every country the range counts, with formats and the next meeting, in the region in view", async () => {
    render(<WorldMap reach={REACH} />);
    await mapReady();
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    const table = screen.getByRole("table", { name: /^Countries with meetings this year/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Japan", "Brazil", "Germany", "Kenya"]);
    const japan = within(rows[0] as HTMLElement).getAllByRole("cell").map((c) => c.textContent);
    expect(japan).toEqual(["Asia-Pacific", "2", "18", "1In person1Hybrid", "Oct 1"]);
    const germany = within(rows[2] as HTMLElement).getAllByRole("cell").map((c) => c.textContent);
    expect(germany.at(-1)).toBe("Dec 1 (proposed)");
    const brazil = within(rows[1] as HTMLElement).getAllByRole("cell").map((c) => c.textContent);
    expect(brazil.at(-1)).toBe("—"); // Brazil's visit this year is behind us

    await pickRegion("Region", /^Europe/);
    expect(within(screen.getByRole("table")).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Germany"]);
    expect(screen.queryByText("Loading the map…")).toBeNull();
  });

  it("says so when the range holds nothing, on the map and in the list", async () => {
    const quiet: ReachCard = { ...REACH, next30: cardRange(makeReachData([]), "next30", REACH_NOW) };
    render(<WorldMap reach={quiet} />);
    await mapReady();
    expect(note()).toBe("0 countries");
    expect(screen.getByText("No meetings in the next 30 days")).toBeInTheDocument();
    expect(screen.queryByText(/Countries shaded by meetings/)).toBeNull(); // no ramp to read
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("No meetings in the next 30 days.")).toBeInTheDocument();
  });

  it("falls back to the list where this browser cannot draw the map, and says why", async () => {
    webgl.value = false;
    render(<WorldMap reach={REACH} />);
    expect(screen.getByText("This browser can't draw the map. The list shows the same countries.")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Japan", "Kenya"]);
    expect(screen.queryByRole("button", { name: /^(List|Map)$/ })).toBeNull();
    await act(async () => {});
    expect(FakeMap.last).toBeNull();
  });

  it("pauses the signals from the legend, and remembers it for the full screen", async () => {
    render(<WorldMap reach={REACH} />);
    await mapReady();
    const pause = screen.getByRole("button", { name: "Pause the signals" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("ivp.map.signals")).toBe("paused");
  });

  it("withdraws the pause under reduced motion, where nothing moves", async () => {
    reduce.value = true;
    render(<WorldMap reach={REACH} />);
    await mapReady();
    expect(screen.getByText("Next 30 days", { selector: "div > span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause the signals" })).toBeNull();
  });
});
