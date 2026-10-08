"use client";

import { type FocusEvent, useEffect, useState } from "react";

/** How long a surface stays grown after the pointer leaves it: room to overshoot its edge on the way to a control. */
const LINGER_MS = 300;

/**
 * Whether the reader is on a surface that grows while they use it, as the tucked timeline does: the
 * pointer over it, and for 300 ms after it leaves; focus anywhere inside it; or a press that began
 * on it and is still held, so a drag that strays outside never shrinks what it is dragging. Spread
 * the handlers on the surface.
 */
export function usePresence() {
  const [over, setOver] = useState(false);
  const [pointer, setPointer] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  // The pointer counts until it has been away for LINGER_MS; coming back cancels the countdown.
  useEffect(() => {
    if (over || !pointer) return;
    const timer = setTimeout(() => setPointer(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [over, pointer]);

  // A press ends wherever the pointer is let go, on the surface or off it.
  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [pressed]);

  const handlers = {
    onPointerEnter: () => {
      setOver(true);
      setPointer(true);
    },
    onPointerLeave: () => setOver(false),
    onPointerDown: () => setPressed(true),
    onFocus: () => setFocused(true),
    // Focus moving between the surface's own controls is still focus inside it.
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    },
  };
  return [pointer || focused || pressed, handlers] as const;
}
