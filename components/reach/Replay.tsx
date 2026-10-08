"use client";

import { Pause, Play } from "lucide-react";
import type { CSSProperties } from "react";
import type { RangeKey, Span } from "@/lib/domain/reach-time";
import { REPLAY_LABELS, replayMonth } from "@/lib/reach/replay";
import { cn } from "@/lib/utils";

/**
 * Starts or pauses Replay, sized to sit beside the timeline's range group. Its own name says
 * which it will do (Replay, or Pause while it runs), so — unlike the range buttons beside it —
 * it carries no `aria-pressed`: a control whose accessible name already states the outcome needs
 * no separate pressed state.
 */
export function ReplayButton({ playing, onStart, onPause }: { playing: boolean; onStart: () => void; onPause: () => void }) {
  const Icon = playing ? Pause : Play;
  return (
    <button
      type="button"
      onClick={playing ? onPause : onStart}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground",
        "transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {playing ? "Pause" : "Replay"}
    </button>
  );
}

/**
 * The month Replay is sweeping through, large, for the map's free corner. It is hidden from
 * assistive technology, since read aloud it would be a new month every few seconds; the button
 * beside the timeline already says Pause while the replay runs. It fades in through CSS, and
 * reduced motion drops the fade.
 */
export function ReplayCaption({ range, window, className, style }: { range: RangeKey; window: Span; className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" style={style} className={cn("pointer-events-none animate-in fade-in-0 duration-300 motion-reduce:animate-none", className)}>
      <span className="block text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{REPLAY_LABELS[range]}</span>
      <span className="numeric block text-[42px] leading-none font-semibold tracking-[-0.03em] text-foreground">{replayMonth(window)}</span>
    </div>
  );
}
