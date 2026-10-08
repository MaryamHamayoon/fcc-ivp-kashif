"use client";

import { MoveRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { allowedTransitions, resumeTarget } from "@/lib/domain/status-machine";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";

export type MoveMenuProps = {
  /** IVP code — the menu is named after it, so a screen reader knows which card it opens. */
  code: string;
  status: MeetingStatus;
  previousStatus: MeetingStatus | null;
  onMove: (to: MeetingStatus) => void;
  onResume: () => void;
  disabled?: boolean;
};

/**
 * The keyboard's way onto the board. Drag and drop is a mouse affordance; every move it
 * can make is also here, offering exactly what the status machine allows — and, for a
 * held meeting, the one move it has: back to where it paused.
 */
export function MoveMenu({ code, status, previousStatus, onMove, onResume, disabled = false }: MoveMenuProps) {
  const held = status === "on_hold";
  const targets = allowedTransitions(status);
  const back = resumeTarget(previousStatus);
  const empty = !held && targets.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || empty}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${code}`}
            title={held ? "Resume this meeting" : "Move to…"}
            className="relative z-10 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <MoveRight aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{held ? "On hold" : "Move to…"}</DropdownMenuLabel>
          {held ? (
            <DropdownMenuItem onClick={onResume}>
              <PlayCircle aria-hidden />
              {`Resume to ${STATUS_LABELS[back]}`}
            </DropdownMenuItem>
          ) : (
            targets.map((target) => (
              <DropdownMenuItem key={target} variant={target === "cancelled" ? "destructive" : "default"} onClick={() => onMove(target)}>
                {STATUS_LABELS[target]}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
