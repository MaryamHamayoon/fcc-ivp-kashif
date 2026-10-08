"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { type AlluvialNode, layoutAlluvial, ribbonPath } from "@/lib/charts/alluvial";
import { regionTopicFlows, type TopicFlows } from "@/lib/domain/insights";
import { shortRegionName } from "@/lib/domain/regions";
import { formatNumber } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useChartDims } from "./useChartDims";
import { useSeen } from "./useSeen";

export type TopicFlowProps = {
  flows: TopicFlows;
  /** Accessible name for the whole chart, e.g. "Topics raised in FY26, by region". */
  label: string;
  /** The region the left column is drilled into; null or absent draws every region. */
  region?: string | null;
  /** Given, the chart becomes drillable: pressing a region asks its owner for that region. */
  onRegion?: (region: string | null) => void;
  className?: string;
};

type Side = "source" | "target";
type NodeRef = { side: Side; key: string };
type Pointed = (NodeRef & { kind: "node" }) | { kind: "ribbon"; source: string; target: string };

/** One row of a column, whether it stands for a region, a country or a topic. */
type ViewNode = {
  key: string;
  /** The full name, which the tooltip and the readout use. */
  label: string;
  /** What is drawn beside the bar, shortened where the gutter asks for it. */
  text: string;
  /** Distinct meetings behind the row. */
  meetings: number;
  /** Meeting–topic pairs, which is what the bar is as tall as. */
  mentions: number;
  /** A tally drawn beside the label, in the column that carries one. */
  count: number | null;
  /** Where pressing the row goes; null for a row that only describes itself. */
  href: string | null;
};

/** Both levels reduced to one shape, so everything below the build reads the same either way. */
type View = {
  id: string;
  sources: ViewNode[];
  targets: ViewNode[];
  links: { source: string; target: string; count: number }[];
  /** The region drilled into, or null in the overview. */
  region: string | null;
  /** How many countries the last row stands for; 0 when none are folded. */
  folded: number;
  /** What a screen reader is told once the chart has arrived at this view. */
  announcement: string;
};

const DEFAULT_WIDTH = 720;
const ROW = 46;
const BAR = 6;
/** A sliver of surface between a node and the ribbons leaving it, so the bar reads as its own mark. */
const BAR_GAP = 2;
const NODE_GAP = 14;
/** One meeting is never drawn thicker than this, so a region of two meetings reads as two ribbons, not as a wall. */
const MAX_UNIT = 24;
const FEATHER = 96;
const EASE = [0.22, 1, 0.36, 1] as const;
/** Rows the drilled column draws before the smallest countries are gathered into the last of them. */
const MAX_COUNTRIES = 8;
/** Below this the label gutter has no room for the chevron that hints at the level underneath. */
const ROOM_FOR_HINT = 600;
const OVERVIEW = "__all";

const meetings = (n: number) => `${formatNumber(n)} ${n === 1 ? "meeting" : "meetings"}`;
const times = (n: number) => `${formatNumber(n)} ${n === 1 ? "time" : "times"}`;
const nodeId = (node: NodeRef) => `${node.side}:${node.key}`;
const topicNode = (t: { key: string; label: string; meetings: number }): ViewNode => ({ key: t.key, label: t.label, text: t.label, meetings: t.meetings, mentions: t.meetings, count: t.meetings, href: null });

function gutters(width: number): { left: number; right: number } {
  if (width < 440) return { left: 88, right: 120 };
  if (width < ROOM_FOR_HINT) return { left: 112, right: 152 };
  return { left: 168, right: 228 };
}

/** Each node's label owns the band from halfway to the node above to halfway to the one below. */
function bands(nodes: AlluvialNode[], height: number): Map<string, { top: number; height: number }> {
  const out = new Map<string, { top: number; height: number }>();
  nodes.forEach((node, i) => {
    const above = nodes[i - 1];
    const below = nodes[i + 1];
    const top = above ? (above.y1 + node.y0) / 2 : Math.max(0, node.y0 - NODE_GAP / 2);
    const bottom = below ? (node.y1 + below.y0) / 2 : Math.min(height, node.y1 + NODE_GAP / 2);
    out.set(node.key, { top, height: bottom - top });
  });
  return out;
}

/**
 * Who came to talk about what. Regions stand on the left, the year's leading topics on the
 * right, and every ribbon between them is as thick as the meetings it carries — so the picture
 * answers two questions at once: which topics lead, and whose agenda they are. One hue
 * throughout; emphasis is carried by weight, not by a color per region. Point at, or arrow to,
 * a region or a topic and its ribbons light while the rest recede, and the line underneath
 * says in words what is lit.
 *
 * Given `onRegion`, the left column has a second level under it: press a region and the same
 * picture is redrawn from that region's countries, under a breadcrumb whose `All regions` is the
 * way back. The card keeps the height it had, so nothing below it moves.
 */
export function TopicFlow({ flows, label, region = null, onRegion, className }: TopicFlowProps) {
  const reduce = useReducedMotion();
  const maskId = `flow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { ref: measure, width: measured } = useChartDims();
  const { ref: watch, seen } = useSeen();
  const width = measured || DEFAULT_WIDTH;
  const { left, right } = gutters(width);
  // Both views are as tall as the overview, so drilling in and out never resizes the card.
  const rows = Math.max(flows.regions.length, flows.topics.length);
  const height = Math.min(420, Math.max(260, rows * ROW));

  const view = useMemo<View>(() => {
    const drill = region ? regionTopicFlows(flows, region, MAX_COUNTRIES) : null;
    if (drill) {
      return {
        id: drill.region,
        sources: drill.countries.map((c) => ({ key: c.key, label: c.label, text: c.label, meetings: c.meetings, mentions: c.mentions, count: null, href: c.code ? `/countries/${c.code}` : null })),
        targets: drill.topics.map(topicNode),
        links: drill.links.map((l) => ({ source: l.country, target: l.topic, count: l.count })),
        region: drill.region,
        folded: drill.folded,
        announcement: `Showing ${drill.region} by country: ${formatNumber(drill.countries.length)} countries.`,
      };
    }
    return {
      id: OVERVIEW,
      sources: flows.regions.map((r) => ({ key: r.key, label: r.label, text: shortRegionName(r.label), meetings: r.meetings, mentions: r.mentions, count: null, href: null })),
      targets: flows.topics.map(topicNode),
      links: flows.links.map((l) => ({ source: l.region, target: l.topic, count: l.count })),
      region: null,
      folded: 0,
      announcement: "Showing all regions.",
    };
  }, [flows, region]);

  const layout = useMemo(
    () =>
      layoutAlluvial(
        {
          sources: view.sources.map((n) => n.key),
          targets: view.targets.map((n) => n.key),
          links: view.links.map((l) => ({ source: l.source, target: l.target, value: l.count })),
        },
        { height, gap: NODE_GAP, maxUnit: MAX_UNIT },
      ),
    [view, height],
  );

  const [hovered, setHovered] = useState<Pointed | null>(null);
  const [focused, setFocused] = useState<NodeRef | null>(null);
  const firstStop: NodeRef | null = view.sources[0] ? { side: "source", key: view.sources[0].key } : null;
  const [stop, setStop] = useState<NodeRef | null>(firstStop);
  const [announcement, setAnnouncement] = useState("");
  const [entered, setEntered] = useState(false);
  const elements = useRef(new Map<string, HTMLElement>());
  const back = useRef<HTMLButtonElement>(null);
  /**
   * What to put focus on once the view a press asked for has drawn. Only a press inside the chart
   * sets it, and it names the view it is waiting for: a press the owner did not act on must not
   * claim the focus of some later change that the chart had no part in.
   */
  const handoff = useRef<{ view: string; to: "back" | NodeRef } | null>(null);
  const announced = useRef(view.id);

  useEffect(() => {
    const pending = handoff.current;
    handoff.current = null;
    if (!pending || pending.view !== view.id) return;
    if (pending.to === "back") back.current?.focus();
    else elements.current.get(nodeId(pending.to))?.focus();
  }, [view.id]);

  // The view the chart opened on is what the figure already says; only a change is news.
  useEffect(() => {
    if (announced.current === view.id) return;
    announced.current = view.id;
    setAnnouncement(view.announcement);
  }, [view.id, view.announcement]);

  const find = (side: Side, key: string) => (side === "source" ? view.sources : view.targets).find((n) => n.key === key) ?? null;
  const nameOf = (side: Side, key: string) => find(side, key)?.label ?? key;
  const drawn = (at: Pointed) => (at.kind === "ribbon" ? view.links.some((l) => l.source === at.source && l.target === at.target) : find(at.side, at.key) !== null);

  const pointed: Pointed | null = hovered ?? (focused ? { kind: "node", ...focused } : null);
  // A node that leaves with its view takes no blur with it, so what it left behind points nowhere.
  const active: Pointed | null = pointed && drawn(pointed) ? pointed : null;
  /** In the overview, when the chart can drill, a region is a way into its countries. */
  const opensRegion = Boolean(onRegion) && view.region === null;
  /** A stop kept from the view before would leave the chart with no tab stop at all. */
  const tabStop = stop && (stop.side === "source" ? view.sources : view.targets).some((n) => n.key === stop.key) ? stop : firstStop;

  const ribbonState = (source: string, target: string): "rest" | "active" | "quiet" => {
    if (!active) return "rest";
    if (active.kind === "ribbon") return active.source === source && active.target === target ? "active" : "quiet";
    return (active.side === "source" ? active.key === source : active.key === target) ? "active" : "quiet";
  };
  const nodeLit = (side: Side, key: string): boolean => {
    if (!active) return true;
    if (active.kind === "ribbon") return side === "source" ? active.source === key : active.target === key;
    if (active.side === side) return active.key === key;
    return view.links.some((l) => (side === "source" ? l.source === key && l.target === active.key : l.target === key && l.source === active.key));
  };

  /** A node's partners across the chart, busiest first. */
  const partners = (node: NodeRef) =>
    view.links
      .filter((l) => (node.side === "source" ? l.source === node.key : l.target === node.key))
      .map((l) => ({ label: node.side === "source" ? nameOf("target", l.target) : nameOf("source", l.source), count: l.count }))
      .sort((a, b) => b.count - a.count);

  function describe(ref: NodeRef): string {
    const node = find(ref.side, ref.key);
    if (!node) return ref.key;
    const [first, second] = partners(ref);
    if (ref.side === "source") {
      const invite = node.href ? `. Open ${node.label}` : opensRegion ? ". Show its countries" : "";
      // A row that can be pressed has to answer to what it shows (WCAG 2.5.3), so a shortened label leads its name.
      const spoken = invite && !node.label.includes(node.text) ? `${node.text}, ${node.label}` : node.label;
      return `${spoken}: ${meetings(node.meetings)} raised these topics ${times(node.mentions)}${first ? `, most often ${first.label} (${first.count})` : ""}${invite}`;
    }
    const then = second ? `, then ${second.label} (${second.count})` : "";
    return `${node.label}: ${meetings(node.meetings)}${first ? `, most often with ${first.label} (${first.count})${then}` : ""}`;
  }

  function readout(): string {
    if (!active) {
      // The topics keep the overview's order at both levels, so inside a region the leader is looked for, not assumed.
      const lead = view.targets.reduce<ViewNode | null>((best, t) => (best && best.meetings >= t.meetings ? best : t), null);
      if (!lead) return "";
      const [most] = partners({ side: "target", key: lead.key });
      const within = view.region ? `${shortRegionName(view.region)}: ` : "";
      return `${within}${lead.label} leads with ${meetings(lead.meetings)}${most ? `, most often with ${most.label}` : ""}.`;
    }
    if (active.kind === "ribbon") {
      const link = view.links.find((l) => l.source === active.source && l.target === active.target);
      return `${nameOf("source", active.source)} → ${nameOf("target", active.target)} · ${meetings(link?.count ?? 0)}`;
    }
    const all = partners(active);
    const shown = all.slice(0, 3).map((p) => `${p.label} ${p.count}`).join(", ");
    const more = all.length > 3 ? ` and ${all.length - 3} more` : "";
    return `${nameOf(active.side, active.key)} · ${meetings(find(active.side, active.key)?.meetings ?? 0)} · ${shown}${more}`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!focused) return;
    const column = focused.side === "source" ? layout.sources : layout.targets;
    const other = focused.side === "source" ? layout.targets : layout.sources;
    const index = column.findIndex((n) => n.key === focused.key);
    let next: NodeRef | null = null;
    if (event.key === "ArrowDown") next = { side: focused.side, key: column[Math.min(column.length - 1, index + 1)]?.key ?? focused.key };
    else if (event.key === "ArrowUp") next = { side: focused.side, key: column[Math.max(0, index - 1)]?.key ?? focused.key };
    else if (event.key === "Home") next = { side: focused.side, key: column[0]?.key ?? focused.key };
    else if (event.key === "End") next = { side: focused.side, key: column[column.length - 1]?.key ?? focused.key };
    else if ((event.key === "ArrowRight" && focused.side === "source") || (event.key === "ArrowLeft" && focused.side === "target")) {
      const across = other[Math.min(other.length - 1, index)];
      if (across) next = { side: focused.side === "source" ? "target" : "source", key: across.key };
    }
    if (!next) return;
    event.preventDefault();
    elements.current.get(nodeId(next))?.focus();
  }

  const x0 = left + BAR + BAR_GAP;
  const x1 = width - right - BAR - BAR_GAP;
  const sourceBands = bands(layout.sources, height);
  const targetBands = bands(layout.targets, height);
  const opened = view.region;

  const node = (side: Side, n: ViewNode, band: { top: number; height: number } | undefined) => {
    if (!band) return null;
    const me: NodeRef = { side, key: n.key };
    const lit = nodeLit(side, n.key);
    const isActive = active?.kind === "node" && active.side === side && active.key === n.key;
    const press = side === "source" && opensRegion;
    const opens = side === "source" && n.href !== null;
    /** A label takes a second line only where its band has the room for one. */
    const roomy = band.height >= 36;
    /** The chevron keeps a gutter of its own; in the narrow gutters the label needs every pixel. */
    const hint = press && width >= ROOM_FOR_HINT;

    const shared = {
      ref: (el: HTMLElement | null) => {
        if (el) elements.current.set(nodeId(me), el);
        else elements.current.delete(nodeId(me));
      },
      "aria-label": describe(me),
      tabIndex: tabStop && tabStop.side === side && tabStop.key === n.key ? 0 : -1,
      title: n.label,
      onFocus: () => {
        setFocused(me);
        setStop(me);
      },
      onBlur: () => setFocused(null),
      onMouseEnter: () => setHovered({ kind: "node", ...me }),
      onMouseLeave: () => setHovered(null),
      style: { top: band.top, height: band.height, ...(side === "source" ? { left: 0, width: left + BAR } : { right: 0, width: right + BAR }) },
      className: cn(
        "absolute flex items-center gap-2 rounded-md text-[0.8125rem] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        side === "source" ? "justify-end pl-1" : "pr-1",
        press || opens ? "cursor-pointer" : "cursor-default",
        lit ? "text-foreground" : "text-muted-foreground",
        isActive && "font-medium",
      ),
    };

    const body = (
      <>
        <span
          aria-hidden
          className={cn(
            "min-w-0 py-0.5",
            roomy ? "line-clamp-2 leading-[1.2]" : "truncate",
            side === "source" ? "text-right" : "flex-1",
            isActive && (press || opens) && "underline underline-offset-2",
            isActive && press && "text-primary",
          )}
          style={side === "source" ? { marginRight: hint ? 0 : BAR + 10 } : { marginLeft: BAR + 10 }}
        >
          {n.text}
        </span>
        {/* There before it is pointed at, so the level underneath shows at a glance; quiet until then. */}
        {hint ? <ChevronRight aria-hidden style={{ marginRight: BAR + 10 }} className={cn("size-3 shrink-0 transition-colors", isActive ? "text-primary" : lit ? "text-muted-foreground" : "text-muted-foreground/50")} /> : null}
        {n.count === null ? null : (
          <span aria-hidden className={cn("numeric shrink-0 text-xs", lit ? "text-muted-foreground" : "text-muted-foreground/70")}>
            {formatNumber(n.count)}
          </span>
        )}
      </>
    );

    if (press) {
      return (
        <button
          key={nodeId(me)}
          type="button"
          {...shared}
          onClick={() => {
            handoff.current = { view: n.key, to: "back" };
            onRegion?.(n.key);
          }}
        >
          {body}
        </button>
      );
    }
    if (opens && n.href) {
      return (
        <Link key={nodeId(me)} href={n.href} {...shared}>
          {body}
        </Link>
      );
    }
    return (
      <div key={nodeId(me)} role="img" {...shared}>
        {body}
      </div>
    );
  };

  // The program's tally of undrawn topics is the overview's to give: inside a region it would read
  // as that region's own, so the drilled view says only that the leading topics are what is drawn.
  const unshown =
    flows.otherTopics === 0
      ? ""
      : opened
        ? "Only the year's leading topics are drawn."
        : `${formatNumber(flows.otherTopics)} more ${flows.otherTopics === 1 ? "topic was" : "topics were"} raised less often and ${flows.otherTopics === 1 ? "is" : "are"} not drawn.`;
  const gathered = opened && view.folded > 0 ? `${formatNumber(view.folded)} countries with fewer mentions are gathered in the last row.` : "";
  const invite = opened ? (view.sources.some((n) => n.href) ? "Select a country to open it." : "") : onRegion ? "Select a region to see its countries." : "";
  const footnote = [unshown, gathered, invite].filter(Boolean).join(" ");

  return (
    // `relative` keeps the sr-only announcement from inflating the page inside a scrolling column.
    <div className={cn("relative flex w-full flex-col", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {opened ? (
          <span style={{ minWidth: left, paddingRight: 10 }} className="flex items-center justify-end gap-1 whitespace-nowrap">
            <button
              type="button"
              ref={back}
              onClick={() => {
                handoff.current = { view: OVERVIEW, to: { side: "source", key: opened } };
                onRegion?.(null);
              }}
              className="rounded-sm text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              All regions
            </button>
            <ChevronRight aria-hidden className="size-3 text-muted-foreground/70" />
            <span aria-hidden className="font-medium text-foreground">
              {shortRegionName(opened)}
            </span>
          </span>
        ) : (
          <span aria-hidden style={{ width: left, paddingRight: 10 }} className="text-right">
            Regions
          </span>
        )}
        <span style={{ width: right, paddingLeft: 10 }} className="flex shrink-0 items-center justify-between gap-2 pr-1">
          <span aria-hidden className="truncate">
            Topics
          </span>
          <span aria-hidden>Meetings</span>
        </span>
      </div>

      <div
        ref={(el) => {
          measure(el);
          watch(el);
        }}
        role="group"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative w-full"
        style={{ height }}
      >
        <svg aria-hidden width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={`${maskId}-edge`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" />
              <stop offset={width / (width + FEATHER)} stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </linearGradient>
            {/* The ribbons are drawn in from the left, behind a soft leading edge — on arrival,
                and again whenever the chart changes level, which is quicker and has no wait. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={-8} width={width} height={height + 16}>
              <motion.rect
                key={view.id}
                y={-8}
                width={width + FEATHER}
                height={height + 16}
                fill={`url(#${maskId}-edge)`}
                initial={reduce ? false : { x: -(width + FEATHER) }}
                animate={{ x: seen ? 0 : -(width + FEATHER) }}
                transition={motionTransition({ duration: entered ? 0.7 : 1.1, ease: EASE, delay: entered ? 0 : 0.1 })}
                onAnimationComplete={() => {
                  if (seen) setEntered(true);
                }}
              />
            </mask>
          </defs>

          {/* On paper there is no entrance to wait for: the mask is dropped so an unscrolled chart still prints. */}
          <g mask={`url(#${maskId})`} className="print:[mask:none]">
            {layout.links.map((link) => {
              const state = ribbonState(link.source, link.target);
              return (
                <path
                  key={`${link.source}→${link.target}`}
                  data-ribbon={`${link.source}→${link.target}`}
                  data-state={state}
                  d={ribbonPath(link, x0, x1)}
                  fill="var(--chart-1)"
                  fillOpacity={state === "active" ? 0.72 : state === "quiet" ? 0.06 : 0.22}
                  // A hairline ribbon is still a target: the clear stroke widens what the pointer can find.
                  stroke="transparent"
                  strokeWidth={5}
                  className="transition-[fill-opacity] duration-200"
                  onMouseEnter={() => setHovered({ kind: "ribbon", source: link.source, target: link.target })}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </g>

          {layout.sources.map((n) => (
            <rect key={n.key} x={left} y={n.y0} width={BAR} height={Math.max(1.5, n.y1 - n.y0)} rx={2} fill="var(--chart-1)" opacity={nodeLit("source", n.key) ? 1 : 0.28} className="transition-opacity duration-200" />
          ))}
          {layout.targets.map((n) => (
            <rect key={n.key} x={width - right - BAR} y={n.y0} width={BAR} height={Math.max(1.5, n.y1 - n.y0)} rx={2} fill="var(--chart-1)" opacity={nodeLit("target", n.key) ? 1 : 0.28} className="transition-opacity duration-200" />
          ))}
        </svg>

        {/* A level the reader asked for arrives in its own right, so its rows fade in together. */}
        <motion.div key={view.id} className="absolute inset-0" initial={entered && !reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={motionTransition({ duration: 0.2, ease: EASE })}>
          {view.sources.map((n) => node("source", n, sourceBands.get(n.key)))}
          {view.targets.map((n) => node("target", n, targetBands.get(n.key)))}
        </motion.div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p data-testid="flow-readout" className="mt-3 min-h-10 text-[0.8125rem] leading-5 text-foreground sm:min-h-5">
        {readout()}
      </p>
      {footnote ? <p className="mt-1 text-[0.6875rem] text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}
