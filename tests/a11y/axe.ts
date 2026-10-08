import { expect } from "vitest";
import { axe } from "vitest-axe";

/**
 * Shared axe runner for component-level checks.
 *
 * Scoped to WCAG 2.0/2.1 A and AA — what Section 508 actually requires — plus axe's
 * best-practice rules, which catch the structural slips (empty table headers, duplicate ids,
 * nested interactive controls, disallowed ARIA roles) that pass the letter of the guidelines
 * and still break a screen reader. Nothing in this suite trips them today; if a new component
 * legitimately does (a fragment that starts at `h3`, say), narrow that one call rather than
 * loosening the default for everybody.
 *
 * Colour contrast needs real layout, so axe skips it under jsdom; `e2e/a11y.spec.ts` checks
 * contrast against the live tokens in both themes.
 */
const RULE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] as const;

export async function expectNoViolations(container: Element, tags: readonly string[] = RULE_TAGS): Promise<void> {
  // jsdom cannot answer axe's frame messaging, so a preview <iframe> is checked for its title only.
  const results = await axe(container, { runOnly: { type: "tag", values: [...tags] }, iframes: false });
  expect(results).toHaveNoViolations();
}
