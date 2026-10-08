import { randomUUID } from "node:crypto";

/** Prefixed, URL-safe identifiers: `mtg_9f1c2a7b3d4e5f60`. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
