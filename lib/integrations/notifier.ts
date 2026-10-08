/**
 * Outbound notifications (an expert asked to brief, a status change, a follow-up coming due).
 * Phase 1 has no mail server or Teams webhook wired up, so `LogNotifier` stands in for one:
 * it writes a line to the server console in dev and does nothing under the test runner, so
 * services can call `notifier.notify(...)` today and get a real adapter later for free.
 */
export type NotifyEvent = {
  /** Short machine-readable kind, e.g. "expert_requested", "meeting_confirmed", "follow_up_due". */
  kind: string;
  /** One-line human summary, safe to show verbatim in a log or a future email subject. */
  message: string;
  meetingId?: string;
  recipientEmail?: string;
  at?: Date;
};

export interface Notifier {
  notify(event: NotifyEvent): Promise<void>;
}

/** Console-logs in dev; a no-op under Vitest so test output stays quiet. */
export class LogNotifier implements Notifier {
  async notify(event: NotifyEvent): Promise<void> {
    if (process.env.VITEST) return;
    const { kind, message, meetingId, recipientEmail, at = new Date() } = event;
    console.log(`[notify] ${at.toISOString()} ${kind}${recipientEmail ? ` → ${recipientEmail}` : ""}${meetingId ? ` (${meetingId})` : ""}: ${message}`);
  }
}
