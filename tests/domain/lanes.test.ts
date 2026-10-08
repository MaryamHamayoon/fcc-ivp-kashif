// @vitest-environment node
import { assignLanes } from "@/lib/domain/lanes";

describe("assignLanes", () => {
  it("packs overlapping intervals into the lowest free lane", () => {
    const out = assignLanes([
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 5, end: 15 },
      { id: "c", start: 12, end: 20 },
      { id: "d", start: 16, end: 30 },
    ]);
    expect(out.map((o) => `${o.id}:${o.lane}`)).toEqual(["a:0", "b:1", "c:0", "d:1"]);
  });

  it("keeps non-overlapping intervals on lane 0 and is order-independent", () => {
    const out = assignLanes([
      { id: "c", start: 20, end: 30 },
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 10, end: 20 },
    ]);
    expect(out.map((o) => `${o.id}:${o.lane}`)).toEqual(["a:0", "b:0", "c:0"]);
  });

  it("handles an empty list", () => {
    expect(assignLanes([])).toEqual([]);
  });
});
