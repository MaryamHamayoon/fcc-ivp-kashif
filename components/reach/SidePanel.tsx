"use client";

import { Columns3, X } from "lucide-react";
import { createContext, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref, useContext, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EDGE, EDGE_TAB_WIDTH } from "@/lib/reach/layout";
import { cn } from "@/lib/utils";
import { awayTo, SLIDE } from "./away";

/**
 * Where one of the full screen's panels is: floating beside the map (`docked`), slid off its edge
 * with a tab standing for it (`tucked`), open over the map from that tab (`drawer`), or gone with
 * its tab while the tour runs (`away`).
 */
export type PanelMode = "docked" | "tucked" | "drawer" | "away";

const Drawer = createContext<{ label: string; close: () => void } | null>(null);

/** The drawer's close button, for the end of a panel's own title bar. Anywhere but an open drawer it is nothing. */
export function DrawerClose({ className }: { className?: string }) {
  const drawer = useContext(Drawer);
  if (!drawer) return null;
  const name = `Close ${drawer.label}`;
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" data-drawer-close="" aria-label={name} onClick={drawer.close} className={cn("size-8 shrink-0 self-center text-muted-foreground", className)} />}>
        <X aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">{name}</TooltipContent>
    </Tooltip>
  );
}

/** The strip's Panels button: a toggle with one name, pressed while the panels float beside the map. */
export function PanelsButton({ tucked, onToggle }: { tucked: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Panels" aria-pressed={!tucked} onClick={onToggle} className="text-muted-foreground aria-pressed:text-foreground" />}>
        <Columns3 aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">Panels</TooltipContent>
    </Tooltip>
  );
}

/** The tab at mid-height that stands for a tucked panel, its name set on end. */
function EdgeTab({ ref, side, label, icon, onOpen }: { ref: Ref<HTMLButtonElement>; side: "left" | "right"; label: string; icon: ReactNode; onOpen: () => void }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      data-rail-surface=""
      className={cn(
        "glass absolute top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground",
        "animate-in duration-300 fade-in-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:animate-none",
      )}
      style={{ ...(side === "left" ? { left: EDGE } : { right: EDGE }), width: EDGE_TAB_WIDTH }}
    >
      <span aria-hidden className="flex [&>svg]:size-3.5">
        {icon}
      </span>
      <span className={cn("[writing-mode:vertical-rl]", side === "left" && "rotate-180")}>{label}</span>
    </button>
  );
}

type SidePanelProps = {
  side: "left" | "right";
  /** The panel's name: its edge tab's words, and what the drawer's close button closes. */
  label: string;
  /** The edge tab's icon. */
  icon: ReactNode;
  /** The panel's own title, which names the aside. */
  titleId: string;
  mode: PanelMode;
  width: number;
  /** Under 768 px a drawer takes the window's width, between its edges. */
  full?: boolean;
  top: number;
  bottom: number;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
};

/**
 * One of the full screen's two panels. Docked, it floats beside
 * the map. Tucked, it slides off its own edge (420 ms, the app's ease-out) and a tab at mid-height
 * stands for it. The tab opens it as a drawer over the map and moves focus onto the drawer's close
 * button, in the panel's own title bar (`DrawerClose`), and an Escape nothing inside it has used
 * closes it. Under 768 px (`full`) the drawer spans the window between its edges. Whatever is out
 * of sight is out of reach: the aside is `inert` whenever it is not shown.
 */
export function SidePanel({ side, label, icon, titleId, mode, width, full = false, top, bottom, onOpen, onClose, children }: SidePanelProps) {
  const aside = useRef<HTMLElement>(null);
  const tab = useRef<HTMLButtonElement>(null);
  const hidden = mode === "tucked" || mode === "away";

  // Opened from its tab, the drawer takes focus. flushSync lifts `inert` first, so the close button can take it.
  const open = () => {
    flushSync(onOpen);
    aside.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus({ preventScroll: true });
  };

  // Whether focus is in the panel, kept as it moves. Focus dropped to the page, as when the control that
  // had it goes away with the drawer, still counts as the panel's.
  const focusInside = useRef(false);
  const onFocus = () => {
    focusInside.current = true;
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.relatedTarget) focusInside.current = event.currentTarget.contains(event.relatedTarget);
  };

  // A panel that tucks away with focus in it, as when its drawer closes or the window narrows past 1280 px,
  // hands focus to its tab rather than dropping it to the page. Focus anywhere else stays put.
  useLayoutEffect(() => {
    if (mode !== "tucked" || !focusInside.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && !aside.current?.contains(active)) return;
    focusInside.current = false;
    tab.current?.focus({ preventScroll: true });
  }, [mode]);

  // The drawer is nearest a reader working in it, so it takes their Escape before the page does.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (mode !== "drawer" || event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };

  const edge: CSSProperties = full ? { left: EDGE, right: EDGE } : side === "left" ? { left: EDGE, width } : { right: EDGE, width };
  return (
    <>
      {mode === "tucked" ? <EdgeTab ref={tab} side={side} label={label} icon={icon} onOpen={open} /> : null}
      <aside
        ref={aside}
        inert={hidden}
        aria-labelledby={titleId}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        data-rail-surface=""
        className={cn("glass absolute flex flex-col overflow-hidden", SLIDE, mode === "drawer" ? "z-30" : "z-10")}
        style={{ ...edge, top, bottom, transform: awayTo(side, hidden) }}
      >
        <Drawer value={mode === "drawer" ? { label, close: onClose } : null}>{children}</Drawer>
      </aside>
    </>
  );
}
