import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges tailwind classes with the last conflicting class winning", () => {
    expect(cn("p-2", "p-4", "text-sm")).toBe("p-4 text-sm");
  });
});
