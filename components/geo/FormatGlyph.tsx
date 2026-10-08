import { FORMAT_COLORS } from "@/components/charts/FormatDonut";
import { FORMAT_ORDER, type FormatMix } from "@/lib/domain/reach";
import { FORMAT_LABELS, type MeetingFormat } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * A meeting's format told by shape before color, as the map's marks tell it: in person a solid
 * disc, hybrid a ring around a core, virtual an open ring. For lists, the legend and the
 * timeline. Decorative: whatever shows it also names the format in words.
 */
export function FormatGlyph({ format, size = 10, className }: { format: MeetingFormat; size?: number; className?: string }) {
  const r = size / 2;
  const rim = Math.max(1.5, size * 0.18);
  const color = FORMAT_COLORS[format];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false" data-format={format} className={cn("inline-block shrink-0", className)}>
      {format === "in_person" ? <circle cx={r} cy={r} r={r} fill={color} /> : <circle cx={r} cy={r} r={r - rim / 2} fill="none" stroke={color} strokeWidth={rim} />}
      {format === "hybrid" ? <circle cx={r} cy={r} r={r * 0.46} fill={color} /> : null}
    </svg>
  );
}

/** A count per format, each told by glyph, number and word, leaving out a format with none: the tooltip's, the panel's and the list's breakdown. */
export function FormatBreakdown({ mix, className }: { mix: FormatMix; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {FORMAT_ORDER.filter((format) => mix[format] > 0).map((format) => (
        <li key={format} className="inline-flex items-center gap-1">
          <FormatGlyph format={format} size={9} />
          <span className="numeric font-medium">{mix[format]}</span>
          {FORMAT_LABELS[format]}
        </li>
      ))}
    </ul>
  );
}
