/**
 * Geometry for a two-column alluvial (flow) diagram: sources down the left, targets down the
 * right, a ribbon per link whose thickness is its value. Pure arithmetic — the component decides
 * the x positions, the colors and the motion.
 */

export type AlluvialInput = {
  /** Node keys top to bottom; a node's size is the sum of the links it carries. */
  sources: string[];
  targets: string[];
  links: { source: string; target: string; value: number }[];
};

export type AlluvialNode = { key: string; value: number; y0: number; y1: number };

export type AlluvialLink = {
  source: string;
  target: string;
  value: number;
  /** Where the ribbon leaves its source node, and where it lands on its target node. */
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
};

export type AlluvialLayout = { sources: AlluvialNode[]; targets: AlluvialNode[]; links: AlluvialLink[] };

/** How tall a side stands: its units, and the gaps between its nodes. */
const extent = (count: number, total: number, unit: number, gap: number) => total * unit + gap * Math.max(0, count - 1);

function stack(keys: string[], values: Map<string, number>, unit: number, gap: number, tallest: number): AlluvialNode[] {
  const total = keys.reduce((sum, key) => sum + (values.get(key) ?? 0), 0);
  let y = (tallest - extent(keys.length, total, unit, gap)) / 2; // the side with fewer gaps is shorter; center it against the other
  return keys.map((key) => {
    const value = values.get(key) ?? 0;
    const node = { key, value, y0: y, y1: y + value * unit };
    y = node.y1 + gap;
    return node;
  });
}

export type AlluvialOptions = {
  height: number;
  gap: number;
  /**
   * The thickest one unit may be drawn. Without it a chart of two meetings fills the height as a
   * chart of forty does, and a single meeting becomes a slab; with it a sparse chart stays a few
   * ribbons hung from the top, with the room it did not need left underneath.
   */
  maxUnit?: number;
};

export function layoutAlluvial(input: AlluvialInput, opts: AlluvialOptions): AlluvialLayout {
  const known = (list: string[]) => new Set(list);
  const sourceKeys = known(input.sources);
  const targetKeys = known(input.targets);
  const usable = input.links.filter((l) => l.value > 0 && sourceKeys.has(l.source) && targetKeys.has(l.target));

  const sourceValues = new Map<string, number>();
  const targetValues = new Map<string, number>();
  for (const l of usable) {
    sourceValues.set(l.source, (sourceValues.get(l.source) ?? 0) + l.value);
    targetValues.set(l.target, (targetValues.get(l.target) ?? 0) + l.value);
  }
  const sources = input.sources.filter((key) => sourceValues.has(key));
  const targets = input.targets.filter((key) => targetValues.has(key));
  const total = usable.reduce((sum, l) => sum + l.value, 0);
  if (total === 0) return { sources: [], targets: [], links: [] };

  // One thickness per unit on both sides: the busier side (more gaps) sets it, up to the cap.
  const unit = Math.min((opts.height - opts.gap * (sources.length - 1)) / total, (opts.height - opts.gap * (targets.length - 1)) / total, opts.maxUnit ?? Infinity);
  // The taller side hangs from the top. Uncapped it is the full height; capped, the room left over is underneath.
  const tallest = Math.max(extent(sources.length, total, unit, opts.gap), extent(targets.length, total, unit, opts.gap));
  const sourceNodes = stack(sources, sourceValues, unit, opts.gap, tallest);
  const targetNodes = stack(targets, targetValues, unit, opts.gap, tallest);

  // Inside a node, ribbons run in the other side's order, which is what keeps crossings down.
  const sourceIndex = new Map(sources.map((key, i) => [key, i]));
  const targetIndex = new Map(targets.map((key, i) => [key, i]));
  const ordered = [...usable].sort((a, b) => sourceIndex.get(a.source)! - sourceIndex.get(b.source)! || targetIndex.get(a.target)! - targetIndex.get(b.target)!);

  const sourceCursor = new Map(sourceNodes.map((n) => [n.key, n.y0]));
  const links: AlluvialLink[] = ordered.map((l) => {
    const sy0 = sourceCursor.get(l.source)!;
    const sy1 = sy0 + l.value * unit;
    sourceCursor.set(l.source, sy1);
    return { source: l.source, target: l.target, value: l.value, sy0, sy1, ty0: 0, ty1: 0 };
  });

  const targetCursor = new Map(targetNodes.map((n) => [n.key, n.y0]));
  const byTarget = [...links].sort((a, b) => targetIndex.get(a.target)! - targetIndex.get(b.target)! || sourceIndex.get(a.source)! - sourceIndex.get(b.source)!);
  for (const link of byTarget) {
    link.ty0 = targetCursor.get(link.target)!;
    link.ty1 = link.ty0 + link.value * unit;
    targetCursor.set(link.target, link.ty1);
  }

  return { sources: sourceNodes, targets: targetNodes, links };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A filled ribbon between x0 (the source column's inner edge) and x1 (the target's), eased through the midpoint. */
export function ribbonPath(link: Pick<AlluvialLink, "sy0" | "sy1" | "ty0" | "ty1">, x0: number, x1: number): string {
  const mid = round((x0 + x1) / 2);
  const [a, b, c, d] = [round(link.sy0), round(link.sy1), round(link.ty0), round(link.ty1)];
  return `M${round(x0)},${a}C${mid},${a} ${mid},${c} ${round(x1)},${c}L${round(x1)},${d}C${mid},${d} ${mid},${b} ${round(x0)},${b}Z`;
}
