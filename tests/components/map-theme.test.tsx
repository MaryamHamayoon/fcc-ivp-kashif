// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { type MapTheme, useMapTheme } from "@/components/geo/useMapTheme";
import { SIGNALS_PREF, useSignalsPaused } from "@/components/geo/useSignalsPaused";

/* The tokens the hook reads, as the stylesheet sets them: a light base, a dark theme, a legible face. */
const CSS = `
  :root { --map-land: #fbfbf8; --map-water: #dde5e2; --font-ui: "Public Sans", sans-serif; }
  :root[data-theme="dark"] { --map-land: #172019; --map-water: #09100c; }
  :root[data-font="legible"] { --font-ui: "Atkinson Hyperlegible", sans-serif; }
`;

const root = document.documentElement;
let style: HTMLStyleElement;
const seen: MapTheme[] = [];

function ThemeProbe() {
  const theme = useMapTheme();
  seen.push(theme);
  return <output data-testid="theme">{`${theme.palette.key} ${theme.palette.land} ${theme.family}`}</output>;
}

beforeEach(() => {
  seen.length = 0;
  style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
});
afterEach(() => {
  cleanup();
  style.remove();
  for (const name of ["data-theme", "data-font", "data-rail", "data-surface"]) root.removeAttribute(name);
  vi.restoreAllMocks();
});

describe("useMapTheme", () => {
  it("reads the live palette and typeface off the document", async () => {
    render(<ThemeProbe />);
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light-green-standard #fbfbf8 Public Sans"));
  });

  it("reads again when the theme or the typeface changes", async () => {
    render(<ThemeProbe />);
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("#fbfbf8"));

    act(() => root.setAttribute("data-theme", "dark"));
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark-green-standard #172019 Public Sans"));

    act(() => root.setAttribute("data-font", "legible"));
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("Atkinson Hyperlegible"));
  });

  it("ignores the hybrid rail: the map under dark chrome stays light, and nothing is re-read", async () => {
    render(<ThemeProbe />);
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("#fbfbf8"));
    const reads = vi.spyOn(window, "getComputedStyle");
    await act(async () => {
      root.setAttribute("data-rail", "dark");
      await Promise.resolve();
    });
    expect(reads).not.toHaveBeenCalled();
  });

  it("hands back the same object when a watched change leaves the map alone", async () => {
    render(<ThemeProbe />);
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("#fbfbf8"));
    const before = seen.at(-1);
    const renders = seen.length;
    await act(async () => {
      root.setAttribute("data-surface", "white"); // this stylesheet gives the surface no map tokens
      await Promise.resolve();
    });
    expect(seen.length).toBe(renders);
    expect(seen.at(-1)).toBe(before);
  });
});

function PauseProbe() {
  const [paused, setPaused] = useSignalsPaused();
  return (
    <button type="button" onClick={() => setPaused(!paused)}>
      {paused ? "paused" : "moving"}
    </button>
  );
}

describe("useSignalsPaused", () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => SIGNALS_PREF.set("moving"));
  });

  it("is one choice per browser, shared by every map on the page", () => {
    render(
      <>
        <PauseProbe />
        <PauseProbe />
      </>,
    );
    const [first] = screen.getAllByRole("button");
    act(() => first?.click());
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["paused", "paused"]);
    expect(window.localStorage.getItem("ivp.map.signals")).toBe("paused");
  });
});
