import { createPropertyExpression, featureFilter, type FilterSpecification, latest } from "@maplibre/maplibre-gl-style-spec";

/**
 * MapLibre's own expression engine, without a map: evaluates a paint or layout value, or a
 * layer filter, for one feature at one zoom. A test can then check what the map would draw
 * instead of how an expression is spelled. Colors come back as "rgba(r,g,b,a)".
 */

type Where = { zoom: number; properties?: Record<string, unknown>; state?: Record<string, unknown> };
type Spec = Parameters<typeof createPropertyExpression>[2];

const feature = (properties: Record<string, unknown> = {}) => ({ type: 1, properties }) as never;

export function evaluate(layerType: "circle" | "fill" | "line" | "symbol", group: "paint" | "layout", property: string, value: unknown, where: Where): unknown {
  const spec = (latest as unknown as Record<string, Record<string, Spec> | undefined>)[`${group}_${layerType}`]?.[property];
  if (!spec) throw new Error(`No ${group} property ${property} on ${layerType} layers`);
  const parsed = createPropertyExpression(value, property, spec);
  if (parsed.result === "error") throw new Error(parsed.value.map((e) => e.message).join("; "));
  const out: unknown = parsed.value.evaluate({ zoom: where.zoom }, feature(where.properties), where.state ?? {});
  return typeof out === "object" && out !== null && "r" in out ? String(out) : out;
}

/** Whether a layer's filter lets a feature through. */
export function matches(filter: FilterSpecification | undefined, properties: Record<string, unknown>, zoom = 3): boolean {
  return featureFilter(filter, "filter").filter({ zoom }, feature(properties));
}

/** "#3b6fd8" as the engine prints it: "rgba(59,111,216,1)". */
export const rgba = (hex: string): string => `rgba(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(",")},1)`;
