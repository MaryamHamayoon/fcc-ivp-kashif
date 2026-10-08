// @vitest-environment node
import { opensTucked, panelsTucked, reachLayout, TOUR_PADDING } from "@/lib/reach/layout";

describe("the full screen's layout", () => {
  it("keeps the map's camera clear of the strip, both panels and the timeline", () => {
    expect(reachLayout({ width: 1440, tucked: false })).toEqual({ tucked: false, compact: false, timelineHeight: 172, padding: { top: 76, right: 392, bottom: 196, left: 320 } });
  });

  it("gives the freed space back when the panels tuck away, leaving room for their edge tabs", () => {
    expect(reachLayout({ width: 1440, tucked: true })).toEqual({ tucked: true, compact: false, timelineHeight: 64, padding: { top: 76, right: 52, bottom: 88, left: 52 } });
  });

  it("is always tucked on a phone, where there is no room for panels", () => {
    expect(reachLayout({ width: 390, tucked: false })).toMatchObject({ tucked: true, compact: true, timelineHeight: 64 });
  });

  it("frames the tour between its pill and its caption card, with the chrome away", () => {
    expect(TOUR_PADDING).toEqual({ top: 68, right: 12, bottom: 190, left: 12 });
  });

  it("opens tucked below 1280 px", () => {
    expect(opensTucked(1279)).toBe(true);
    expect(opensTucked(1280)).toBe(false);
  });

  it("tucks the panels as the reader chose, whatever the width; until they choose, the width decides", () => {
    expect(panelsTucked("auto", 1279)).toBe(true);
    expect(panelsTucked("auto", 1280)).toBe(false);
    expect(panelsTucked("open", 1100)).toBe(false);
    expect(panelsTucked("tucked", 1600)).toBe(true);
  });
});
