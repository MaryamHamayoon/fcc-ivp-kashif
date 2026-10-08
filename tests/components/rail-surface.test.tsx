// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RailSurface } from "@/lib/rail-surface";

/** A popover, a tooltip and a menu, each open: all three render at the end of the page, away from where they were opened. */
function Popups() {
  return (
    <>
      <Popover open>
        <PopoverTrigger>Region</PopoverTrigger>
        <PopoverContent aria-label="Region">Regions</PopoverContent>
      </Popover>
      <Tooltip open>
        <TooltipTrigger>Zoom in</TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
      <DropdownMenu open>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Tour</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** The three popups. (Base UI gives a tooltip no role: the trigger is described by it instead.) */
function popups(): HTMLElement[] {
  const tooltip = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
  if (!tooltip) throw new Error("no tooltip");
  return [screen.getByRole("dialog", { name: "Region" }), tooltip, screen.getByRole("menu")];
}

afterEach(cleanup);

describe("popups on the full screen's surfaces", () => {
  it("wear those surfaces' colors, though they render outside them, so Hybrid's dark chrome opens dark menus", () => {
    render(
      <RailSurface value>
        <Popups />
      </RailSurface>,
    );
    for (const popup of popups()) expect(popup).toHaveAttribute("data-rail-surface", "");
  });

  it("stay as they are everywhere else", () => {
    render(<Popups />);
    for (const popup of popups()) expect(popup).not.toHaveAttribute("data-rail-surface");
  });
});
