// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { ActivityTab } from "@/components/meetings/record/ActivityTab";
import type { ActivityEntryView } from "@/components/meetings/record/activity-entries";
import { LifecycleStepper } from "@/components/meetings/record/LifecycleStepper";
import { OverviewTab } from "@/components/meetings/record/OverviewTab";
import { RecordHeader } from "@/components/meetings/record/RecordHeader";
import { makeRecord, RECORD_NOW, VIEWER } from "@/tests/fixtures/record";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meetings/mtg_artci",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

afterEach(cleanup);

const transition = vi.fn(async () => ({ ok: true as const }));
const resume = vi.fn(async () => ({ ok: true as const, status: "developing" as const }));

const entries: ActivityEntryView[] = [
  {
    id: "act_2",
    kind: "email_out",
    body: "Sent the draft agenda and asked for the final delegation roster.",
    occurredAt: new Date("2026-08-07T13:00:00Z"),
    authorName: "Priya Raman",
    waitingOn: "visitor",
    waitingOnLabel: "ARTCI POC",
    nextAction: "Re-send the roster request",
    nextActionDueAt: new Date("2026-09-02T13:00:00Z"),
    resolvedAt: null,
    resolvedByName: null,
  },
  {
    id: "act_1",
    kind: "status_change",
    body: "Status → Confirmed",
    occurredAt: new Date("2026-07-30T15:00:00Z"),
    authorName: "Marcus Bell",
    waitingOn: "none",
    waitingOnLabel: null,
    nextAction: null,
    nextActionDueAt: null,
    resolvedAt: null,
    resolvedByName: null,
  },
];

describe("meeting record accessibility", () => {
  it("the record header carries no WCAG violations for a coordinator or a viewer", async () => {
    const { container, rerender } = render(<RecordHeader record={makeRecord()} transition={transition} resume={resume} />);
    await expectNoViolations(container);
    rerender(<RecordHeader record={makeRecord({}, VIEWER)} transition={transition} resume={resume} />);
    await expectNoViolations(container);
  });

  it("the header of a held meeting carries no WCAG violations", async () => {
    const { container } = render(
      <RecordHeader record={makeRecord({ status: "on_hold", previousStatus: "developing", holdReason: "Travel not cleared", holdFollowUpAt: new Date("2026-09-15T13:00:00Z") })} transition={transition} resume={resume} />,
    );
    await expectNoViolations(container);
  });

  it("the overview tab carries no WCAG violations", async () => {
    const { container } = render(<OverviewTab record={makeRecord()} />);
    await expectNoViolations(container);
  });

  it("the lifecycle stepper carries no WCAG violations in every shape", async () => {
    const { container, rerender } = render(<LifecycleStepper status="confirmed" />);
    await expectNoViolations(container);
    rerender(<LifecycleStepper status="on_hold" previousStatus="developing" holdReason="Embassy has not cleared the delegation to travel." holdFollowUpAt={new Date("2026-09-15T13:00:00Z")} />);
    await expectNoViolations(container);
    rerender(<LifecycleStepper status="cancelled" previousStatus="clearance" cancelReason="The delegation postponed its travel indefinitely." />);
    await expectNoViolations(container);
  });

  it("the activity composer and timeline carry no WCAG violations", async () => {
    const { container, rerender } = render(
      <ActivityTab meetingId="mtg_artci" entries={entries} waitingActivityId="act_2" canLog now={RECORD_NOW} log={vi.fn(async () => ({ ok: true as const, id: "act_new" }))} resolve={vi.fn(async () => ({ ok: true as const, id: "act_2" }))} />,
    );
    await expectNoViolations(container);

    // A viewer sees the log without the composer, and an empty log must read as well as a full one.
    rerender(<ActivityTab meetingId="mtg_artci" entries={[]} waitingActivityId={null} canLog={false} now={RECORD_NOW} log={vi.fn(async () => ({ ok: true as const, id: "act_new" }))} resolve={vi.fn(async () => ({ ok: true as const, id: "act_2" }))} />);
    await expectNoViolations(container);
  });
});
