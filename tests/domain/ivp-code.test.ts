// @vitest-environment node
import { formatIvpCode, parseIvpCode } from "@/lib/domain/ivp-code";

describe("IVP codes", () => {
  it("formats the fiscal year and a zero-padded sequence", () => {
    expect(formatIvpCode(2026, 42)).toBe("IVP-2026-042");
    expect(formatIvpCode(2026, 1)).toBe("IVP-2026-001");
    expect(formatIvpCode(2026, 1234)).toBe("IVP-2026-1234");
  });

  it("parses valid codes case-insensitively and rejects garbage", () => {
    expect(parseIvpCode("IVP-2026-042")).toEqual({ fy: 2026, sequence: 42 });
    expect(parseIvpCode(" ivp-2026-042 ")).toEqual({ fy: 2026, sequence: 42 });
    expect(parseIvpCode("IVP-26-1")).toBeNull();
    expect(parseIvpCode("IVP-2026")).toBeNull();
    expect(parseIvpCode("")).toBeNull();
  });
});
