/** Small deterministic PRNG (mulberry32) so every environment seeds identical data. */
export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: readonly T[]): T[];
  sample<T>(arr: readonly T[], n: number): T[];
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
};

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error("pick() from an empty array");
    return arr[Math.floor(next() * arr.length)] as T;
  };
  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };
  return {
    next,
    int,
    pick,
    chance: (p) => next() < p,
    shuffle,
    sample: (arr, n) => shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length))),
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= w;
        if (r < 0) return value;
      }
      return (entries[entries.length - 1] as (typeof entries)[number])[0];
    },
  };
}
