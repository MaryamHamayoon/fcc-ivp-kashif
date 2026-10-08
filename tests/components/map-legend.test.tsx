// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MapLegend } from "@/components/geo/MapLegend";
import { MAP_PALETTES, ramp } from "@/lib/geo/map-palette";

const reduce = vi.hoisted(() => ({ value: false as boolean | null }));
vi.mock("@/lib/motion", () => ({ useReducedMotion: () => reduce.value, reducedMotionNow: () => reduce.value === true, motionTransition: (t: unknown) => (reduce.value ? { duration: 0 } : t) }));

const RAMP = ramp(MAP_PALETTES["light-green-standard"], 12);
/** How the DOM reports an inline hex color. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

beforeEach(() => {
  reduce.value = false;
});
afterEach(cleanup);

describe("MapLegend", () => {
  it("labels the ramp with the window's minimum and maximum, one swatch per step", () => {
    const { container } = render(<MapLegend ramp={RAMP} signaling={false} paused={false} onPausedChange={() => {}} />);
    expect(screen.getByText("Countries shaded by meetings, from 1 to 12.")).toHaveClass("sr-only");
    const swatches = [...container.querySelectorAll<HTMLElement>("[data-swatch]")];
    expect(swatches).toHaveLength(4);
    expect(swatches.map((s) => s.style.backgroundColor)).toEqual(RAMP.colors.map(rgb));
  });

  it("leaves the ramp out when nothing is shaded", () => {
    render(<MapLegend ramp={null} signaling={false} paused={false} onPausedChange={() => {}} />);
    expect(screen.queryByText(/shaded by meetings/)).toBeNull();
  });

  it("names the three formats in the map's order, each with its glyph", () => {
    const { container } = render(<MapLegend ramp={RAMP} signaling={false} paused={false} onPausedChange={() => {}} />);
    expect([...container.querySelectorAll("svg[data-format]")].map((svg) => svg.getAttribute("data-format"))).toEqual(["in_person", "hybrid", "virtual"]);
    for (const label of ["In person", "Hybrid", "Virtual"]) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the next 30 days and its pause only while something is signaling", () => {
    const { rerender } = render(<MapLegend ramp={RAMP} signaling={false} paused={false} onPausedChange={() => {}} />);
    expect(screen.queryByText("Next 30 days")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<MapLegend ramp={RAMP} signaling paused={false} onPausedChange={() => {}} />);
    expect(screen.getByText("Next 30 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause the signals" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles the pause without changing its name", async () => {
    const user = userEvent.setup();
    const onPausedChange = vi.fn();
    const { rerender } = render(<MapLegend ramp={RAMP} signaling paused={false} onPausedChange={onPausedChange} />);
    await user.click(screen.getByRole("button", { name: "Pause the signals" }));
    expect(onPausedChange).toHaveBeenLastCalledWith(true);

    rerender(<MapLegend ramp={RAMP} signaling paused onPausedChange={onPausedChange} />);
    const button = screen.getByRole("button", { name: "Pause the signals" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    button.focus();
    await user.keyboard("{Enter}");
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
  });

  it("withdraws the pause under reduced motion, since nothing moves, but keeps the entry", () => {
    reduce.value = true;
    render(<MapLegend ramp={RAMP} signaling paused={false} onPausedChange={() => {}} />);
    expect(screen.getByText("Next 30 days")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the pause in the markup until the preference is known, so hydration agrees", () => {
    reduce.value = null;
    render(<MapLegend ramp={RAMP} signaling paused={false} onPausedChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Pause the signals" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<MapLegend ramp={RAMP} signaling paused onPausedChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
