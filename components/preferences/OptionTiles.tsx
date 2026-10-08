"use client";

import type { ReactNode } from "react";
import { RadioCard, RadioCardCheck, RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/**
 * The one control the preferences panel is built from: a radio group whose options are tiles.
 * Each tile is the whole hit target, carries its own miniature preview, and says out loud which
 * one is on — a tick and a brand border, never colour alone.
 */

export type Tile<V extends string> = {
  value: V;
  label: string;
  /** One short line under the label, where an option needs a word of explanation. */
  hint?: string;
  preview?: ReactNode;
};

const COLUMNS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" } as const;

export function OptionTiles<V extends string>({
  value,
  onChange,
  tiles,
  columns = 2,
  labelledBy,
  className,
}: {
  value: V;
  onChange: (value: V) => void;
  tiles: Tile<V>[];
  columns?: keyof typeof COLUMNS;
  labelledBy: string;
  className?: string;
}) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next: unknown) => onChange(next as V)}
      className={cn("grid gap-2", COLUMNS[columns], className)}
    >
      {tiles.map((tile) => (
        <RadioCard key={tile.value} value={tile.value}>
          {tile.preview}
          <span className="block text-[0.8125rem] leading-tight font-medium text-foreground">{tile.label}</span>
          {tile.hint ? <span className="block text-[0.6875rem] leading-snug text-muted-foreground">{tile.hint}</span> : null}
          <RadioCardCheck />
        </RadioCard>
      ))}
    </RadioGroup>
  );
}

/**
 * The same semantics in a strip, for a scale where the steps belong together and the preview is
 * the label: the four text sizes, each drawn at its own weight.
 */
export function SegmentedOptions<V extends string>({
  value,
  onChange,
  tiles,
  labelledBy,
}: {
  value: V;
  onChange: (value: V) => void;
  tiles: Tile<V>[];
  labelledBy: string;
}) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next: unknown) => onChange(next as V)}
      className="flex gap-0.5 rounded-md border border-border bg-muted/50 p-0.5"
    >
      {tiles.map((tile) => (
        <RadioCard key={tile.value} value={tile.value} variant="segment" className="min-w-0">
          {tile.preview}
          <span className="block text-center text-[0.625rem] leading-tight font-medium">{tile.label}</span>
        </RadioCard>
      ))}
    </RadioGroup>
  );
}
