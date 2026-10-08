/**
 * The chrome's way out while the tour runs: each surface slides off past its own side of the window,
 * 420 ms on the app's ease-out, and back the same way. Only the transform moves; the app's
 * reduced-motion rule makes it a cut. 48 px past the edge clears each surface's shadow.
 */
export const SLIDE = "transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

const OFF = {
  top: "translateY(calc(-100% - 48px))",
  right: "translateX(calc(100% + 48px))",
  bottom: "translateY(calc(100% + 48px))",
  left: "translateX(calc(-100% - 48px))",
} as const;

/** The transform that takes a surface off past its side of the window while it is away; none while it is in place. */
export const awayTo = (side: keyof typeof OFF, away: boolean): string | undefined => (away ? OFF[side] : undefined);
