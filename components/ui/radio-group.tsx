"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A radio group whose options are whole surfaces rather than dots — one tab stop for the group,
 * arrow keys between the options, and the entire tile as the hit target. Base UI keeps the real
 * semantics (`role="radio"`, a hidden input, roving focus); everything here is paint.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

/**
 * One option. `card` is a bordered tile that can hold a preview and a label; `segment` is a flat
 * cell for a strip of related choices, where the raised fill alone says which one is on.
 */
function RadioCard({
  className,
  variant = "card",
  ...props
}: RadioPrimitive.Root.Props & {
  variant?: "card" | "segment"
}) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-card"
      data-variant={variant}
      className={cn(
        "group/radio relative cursor-pointer text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50",
        variant === "card" &&
          "flex flex-col gap-1.5 rounded-md border border-border bg-muted/50 p-2.5 pr-5 hover:border-input focus-visible:border-ring data-checked:border-brand data-checked:bg-accent",
        variant === "segment" &&
          "flex flex-1 flex-col items-center justify-center gap-1 rounded-sm px-1 py-1.5 text-muted-foreground hover:text-foreground data-checked:bg-card data-checked:text-foreground data-checked:shadow-soft",
        className
      )}
      {...props}
    />
  )
}

/** The tick a chosen tile wears; Base UI mounts it only while its radio is selected. */
function RadioCardCheck({ className, ...props }: RadioPrimitive.Indicator.Props) {
  return (
    <RadioPrimitive.Indicator
      data-slot="radio-card-check"
      className={cn(
        "absolute top-2 right-2 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden />
    </RadioPrimitive.Indicator>
  )
}

export { RadioCard, RadioCardCheck, RadioGroup }
