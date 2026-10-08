import type { AxeMatchers } from "vitest-axe";
import "vitest";

/**
 * `vitest-axe` declares its matcher on Vitest 1's `namespace Vi`, which Vitest 4 no longer
 * reads. Re-declare it on the current `Matchers` interface so `toHaveNoViolations()` type-checks.
 */
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the whole point is to graft vitest-axe's matcher onto Vitest's interface
  interface Matchers extends AxeMatchers {}
}
