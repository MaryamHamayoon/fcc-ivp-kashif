import { telHref } from "@/lib/format";

describe("telHref", () => {
  it("turns a written US number into a link a phone can dial", () => {
    expect(telHref("(202) 418-1234")).toBe("tel:+12024181234");
    expect(telHref("202.418.1234")).toBe("tel:+12024181234");
    expect(telHref("1 (202) 418-1234")).toBe("tel:+12024181234");
  });

  it("keeps an international number as it was written", () => {
    expect(telHref("+44 20 7981 3000")).toBe("tel:+442079813000");
  });

  it("drops an extension rather than dialling it into the number", () => {
    expect(telHref("(202) 418-1234 ext. 5")).toBe("tel:+12024181234");
    expect(telHref("(202) 418-1234 x5")).toBe("tel:+12024181234");
  });

  it("gives nothing when there is no number to dial", () => {
    expect(telHref("see front desk")).toBeNull();
    expect(telHref("")).toBeNull();
  });
});
