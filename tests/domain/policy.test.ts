// @vitest-environment node
import { can, readableScope, type PolicyUser, type Subject } from "@/lib/domain/policy";

const user = (role: PolicyUser["role"], extra: Partial<PolicyUser> = {}): PolicyUser => ({
  id: `u-${role}`,
  role,
  regionIds: [],
  staffId: null,
  ...extra,
});

const africaMeeting: Subject = { kind: "meeting", regionId: "af", assignedStaffIds: ["s-1", "s-2"] };
const europeMeeting: Subject = { kind: "meeting", regionId: "eur", assignedStaffIds: ["s-9"] };
const system: Subject = { kind: "system" };

describe("policy", () => {
  it("admin can do everything", () => {
    const u = user("admin");
    expect(can(u, "admin.manage", system)).toBe(true);
    expect(can(u, "meeting.transition", africaMeeting)).toBe(true);
    expect(can(u, "expert.respond", africaMeeting)).toBe(true);
  });

  it("coordinator can do everything except administration", () => {
    const u = user("coordinator");
    expect(can(u, "meeting.create", system)).toBe(true);
    expect(can(u, "meeting.update", europeMeeting)).toBe(true);
    expect(can(u, "meeting.transition", europeMeeting)).toBe(true);
    expect(can(u, "activity.create", africaMeeting)).toBe(true);
    expect(can(u, "document.add", africaMeeting)).toBe(true);
    expect(can(u, "reports.read", system)).toBe(true);
    expect(can(u, "admin.manage", system)).toBe(false);
  });

  it("regional lead edits only inside their regions but reads everything", () => {
    const u = user("regional_lead", { regionIds: ["af", "nea"] });
    expect(can(u, "meeting.read", europeMeeting)).toBe(true);
    expect(can(u, "meeting.create", system)).toBe(true);
    expect(can(u, "meeting.update", africaMeeting)).toBe(true);
    expect(can(u, "meeting.update", europeMeeting)).toBe(false);
    expect(can(u, "meeting.transition", africaMeeting)).toBe(true);
    expect(can(u, "activity.create", europeMeeting)).toBe(false);
    expect(can(u, "document.add", africaMeeting)).toBe(true);
    expect(can(u, "admin.manage", system)).toBe(false);
  });

  it("expert sees and responds only on assigned meetings", () => {
    const u = user("expert", { staffId: "s-1" });
    expect(can(u, "meeting.read", africaMeeting)).toBe(true);
    expect(can(u, "meeting.read", europeMeeting)).toBe(false);
    expect(can(u, "expert.respond", africaMeeting)).toBe(true);
    expect(can(u, "expert.respond", europeMeeting)).toBe(false);
    expect(can(u, "document.add", africaMeeting)).toBe(true);
    expect(can(u, "meeting.update", africaMeeting)).toBe(false);
    expect(can(u, "meeting.create", system)).toBe(false);
    expect(can(u, "directory.read", system)).toBe(true);
    expect(can(u, "reports.read", system)).toBe(false);
  });

  it("executive reads everything and edits nothing", () => {
    const u = user("executive");
    expect(can(u, "meeting.read", europeMeeting)).toBe(true);
    expect(can(u, "directory.read", system)).toBe(true);
    expect(can(u, "reports.read", system)).toBe(true);
    expect(can(u, "meeting.create", system)).toBe(false);
    expect(can(u, "activity.create", europeMeeting)).toBe(false);
  });

  it("viewer only reads meetings and the directory", () => {
    const u = user("viewer");
    expect(can(u, "meeting.read", africaMeeting)).toBe(true);
    expect(can(u, "directory.read", system)).toBe(true);
    expect(can(u, "reports.read", system)).toBe(false);
    expect(can(u, "meeting.update", africaMeeting)).toBe(false);
  });

  it("derives a repository read scope per role", () => {
    expect(readableScope(user("admin"))).toEqual({ all: true });
    expect(readableScope(user("regional_lead", { regionIds: ["af"] }))).toEqual({ all: true });
    expect(readableScope(user("executive"))).toEqual({ all: true });
    expect(readableScope(user("expert", { staffId: "s-1" }))).toEqual({ staffId: "s-1" });
    expect(readableScope(user("expert"))).toEqual({ staffId: "" });
  });
});
