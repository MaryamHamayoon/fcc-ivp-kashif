/** Greedy interval packing for timeline rows: each item gets the lowest lane that is free at its start. */
export function assignLanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { ...item, lane };
  });
}
