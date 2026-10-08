// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { LifecycleStepper } from "@/components/meetings/record/LifecycleStepper";

afterEach(cleanup);

/** The `<li>` for a stage, found by the stage name it shows. */
function step(name: string): HTMLElement {
  const list = screen.getByRole("list", { name: "Meeting lifecycle" });
  const li = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { exact: true }) !== null);
  if (!li) throw new Error(`No lifecycle step for "${name}"`);
  return li;
}

/** The word only a screen reader hears: where this stage stands. */
const stateOf = (name: string) => within(step(name)).getByText(/^(Done|Current stage|Paused here|Not started|Stopped here)$/).textContent;

describe("LifecycleStepper", () => {
  it("marks the stages behind, at and ahead of the current status", () => {
    render(<LifecycleStepper status="confirmed" />);

    expect(stateOf("Requested")).toBe("Done");
    expect(stateOf("Developing")).toBe("Done");
    expect(stateOf("Clearance")).toBe("Done");
    expect(stateOf("Confirmed")).toBe("Current stage");
    expect(stateOf("Completed")).toBe("Not started");
    expect(stateOf("Closed")).toBe("Not started");

    expect(step("Confirmed")).toHaveAttribute("aria-current", "step");
    expect(step("Developing")).not.toHaveAttribute("aria-current");
  });

  it("carries the eight workflow steps as reachable hints", () => {
    render(<LifecycleStepper status="requested" />);
    const hints = screen.getAllByRole("button");
    expect(hints).toHaveLength(6);
    expect(hints[0]).toHaveAccessibleName(/Requested/);
  });

  it("shows a hold banner naming the follow-up date and where the meeting resumes", () => {
    render(<LifecycleStepper status="on_hold" previousStatus="developing" holdReason="Embassy has not cleared the delegation to travel." holdFollowUpAt={new Date("2026-09-15T13:00:00Z")} />);

    const banner = screen.getByRole("group", { name: /on hold/i });
    expect(within(banner).getByText("Embassy has not cleared the delegation to travel.")).toBeInTheDocument();
    expect(within(banner).getByText(/Sep 15, 2026/)).toBeInTheDocument();
    expect(within(banner).getByText(/Developing/)).toBeInTheDocument();

    expect(stateOf("Developing")).toBe("Paused here");
    expect(step("Developing")).toHaveAttribute("aria-current", "step");
  });

  it("reads a cancelled meeting as stopped, with no current stage", () => {
    render(<LifecycleStepper status="cancelled" previousStatus="clearance" cancelReason="The delegation postponed its travel indefinitely." />);

    const banner = screen.getByRole("group", { name: /cancelled/i });
    expect(within(banner).getByText("The delegation postponed its travel indefinitely.")).toBeInTheDocument();

    expect(stateOf("Clearance")).toBe("Stopped here");
    expect(stateOf("Confirmed")).toBe("Not started");
    expect(document.querySelector("[aria-current='step']")).toBeNull();
  });

  it("reads a closed meeting as finished", () => {
    render(<LifecycleStepper status="closed" />);
    expect(stateOf("Completed")).toBe("Done");
    expect(stateOf("Closed")).toBe("Current stage");
  });
});
