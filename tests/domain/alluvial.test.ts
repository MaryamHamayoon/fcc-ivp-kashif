// @vitest-environment node
import { layoutAlluvial, ribbonPath } from "@/lib/charts/alluvial";

const input = {
  sources: ["A", "B"],
  targets: ["X", "Y"],
  links: [
    { source: "A", target: "X", value: 2 },
    { source: "A", target: "Y", value: 1 },
    { source: "B", target: "X", value: 1 },
  ],
};

describe("layoutAlluvial", () => {
  it("stacks each side top to bottom, a node as tall as the links it carries, with the gap between nodes", () => {
    // 4 units of flow in 100px with one 10px gap per side: 22.5px per unit.
    const layout = layoutAlluvial(input, { height: 100, gap: 10 });
    expect(layout.sources).toEqual([
      { key: "A", value: 3, y0: 0, y1: 67.5 },
      { key: "B", value: 1, y0: 77.5, y1: 100 },
    ]);
    expect(layout.targets).toEqual([
      { key: "X", value: 3, y0: 0, y1: 67.5 },
      { key: "Y", value: 1, y0: 77.5, y1: 100 },
    ]);
  });

  it("lays ribbons inside their nodes in the other side's order, so they cross as little as they can", () => {
    const { links } = layoutAlluvial(input, { height: 100, gap: 10 });
    expect(links).toEqual([
      { source: "A", target: "X", value: 2, sy0: 0, sy1: 45, ty0: 0, ty1: 45 },
      { source: "A", target: "Y", value: 1, sy0: 45, sy1: 67.5, ty0: 77.5, ty1: 100 },
      { source: "B", target: "X", value: 1, sy0: 77.5, sy1: 100, ty0: 45, ty1: 67.5 },
    ]);
  });

  it("uses one thickness per unit on both sides, and centers the side with fewer gaps", () => {
    // Three sources, one target: the sources need two gaps, so the unit is (100 - 20) / 3.
    const layout = layoutAlluvial(
      { sources: ["A", "B", "C"], targets: ["X"], links: [{ source: "A", target: "X", value: 1 }, { source: "B", target: "X", value: 1 }, { source: "C", target: "X", value: 1 }] },
      { height: 100, gap: 10 },
    );
    const unit = 80 / 3;
    for (const node of layout.sources) expect(node.y1 - node.y0).toBeCloseTo(unit);
    expect(layout.sources.at(-1)!.y1).toBeCloseTo(100);
    const [target] = layout.targets;
    expect(target!.y1 - target!.y0).toBeCloseTo(80);
    expect(target!.y0).toBeCloseTo(10); // 20px of spare height, split above and below
  });

  it("ignores links that name a node it was not given, and drops nodes left with nothing", () => {
    const layout = layoutAlluvial({ sources: ["A", "B"], targets: ["X"], links: [{ source: "A", target: "X", value: 2 }, { source: "A", target: "Z", value: 5 }] }, { height: 50, gap: 4 });
    expect(layout.links).toHaveLength(1);
    expect(layout.sources.map((n) => n.key)).toEqual(["A"]);
    expect(layout.sources[0]).toMatchObject({ value: 2, y0: 0, y1: 50 });
  });

  it("never draws a unit thicker than the cap it is given, and hangs the shorter chart from the top", () => {
    // One unit of flow would fill all 100px; capped at 24 it is a 24px ribbon under the chart's header.
    const layout = layoutAlluvial({ sources: ["A"], targets: ["X"], links: [{ source: "A", target: "X", value: 1 }] }, { height: 100, gap: 10, maxUnit: 24 });
    expect(layout.sources).toEqual([{ key: "A", value: 1, y0: 0, y1: 24 }]);
    expect(layout.targets).toEqual([{ key: "X", value: 1, y0: 0, y1: 24 }]);
    expect(layout.links).toEqual([{ source: "A", target: "X", value: 1, sy0: 0, sy1: 24, ty0: 0, ty1: 24 }]);
  });

  it("centers the shorter side against the taller one when the cap leaves room under both", () => {
    // Three sources of 10px with two gaps make 50px; their one target is 30px, centered in those 50.
    const layout = layoutAlluvial(
      { sources: ["A", "B", "C"], targets: ["X"], links: [{ source: "A", target: "X", value: 1 }, { source: "B", target: "X", value: 1 }, { source: "C", target: "X", value: 1 }] },
      { height: 100, gap: 10, maxUnit: 10 },
    );
    expect(layout.sources.map((n) => [n.y0, n.y1])).toEqual([[0, 10], [20, 30], [40, 50]]);
    expect(layout.targets.map((n) => [n.y0, n.y1])).toEqual([[10, 40]]);
  });

  it("leaves a busy chart alone, whose units are already thinner than the cap", () => {
    expect(layoutAlluvial(input, { height: 100, gap: 10, maxUnit: 24 })).toEqual(layoutAlluvial(input, { height: 100, gap: 10 }));
  });

  it("returns an empty layout when there is nothing to draw", () => {
    expect(layoutAlluvial({ sources: [], targets: [], links: [] }, { height: 100, gap: 10 })).toEqual({ sources: [], targets: [], links: [] });
  });
});

describe("ribbonPath", () => {
  it("runs from the source edge to the target edge and back, closing on itself", () => {
    const path = ribbonPath({ sy0: 0, sy1: 10, ty0: 40, ty1: 50 }, 20, 120);
    expect(path.startsWith("M20,0C70,0 70,40 120,40")).toBe(true);
    expect(path.endsWith("L120,50C70,50 70,10 20,10Z")).toBe(true);
  });
});
