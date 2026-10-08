// @vitest-environment node
import { seedAll } from "@/db/seed";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { SeededAddressBook } from "@/lib/integrations/address-book";

const NOW = new Date("2026-08-29T14:00:00Z");

let t: TestDb;
let book: SeededAddressBook;

beforeAll(async () => {
  t = await createTestDb();
  // meetingCount: 0 — the address book only needs staff and bureaus, not the meeting graph.
  await seedAll(t.db, { now: NOW, meetingCount: 0 });
  book = new SeededAddressBook(t.db);
});
afterAll(() => t.close());

describe("SeededAddressBook", () => {
  it("finds staff by a partial, case-insensitive name match", async () => {
    const hits = await book.search("whitfield");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.name === "Dana Whitfield")).toBe(true);
    expect(hits.every((h) => h.email.length > 0)).toBe(true);
  });

  it("also matches on email and title", async () => {
    const byEmail = await book.search("dana.whitfield@fcc.gov");
    expect(byEmail.some((h) => h.name === "Dana Whitfield")).toBe(true);
    const byTitle = await book.search("Deputy Office Chief");
    expect(byTitle.some((h) => h.name === "Dana Whitfield")).toBe(true);
  });

  it("filters results to one bureau", async () => {
    const oia = await book.search("", { bureauCode: "OIA" });
    expect(oia.length).toBeGreaterThan(0);
    expect(oia.every((h) => h.bureauCode === "OIA")).toBe(true);

    const sb = await book.search("", { bureauCode: "SB" });
    expect(sb.some((h) => h.name === "Tomas Lindqvist")).toBe(true);
  });

  it("caps results at the given limit", async () => {
    const hits = await book.search("", { limit: 3 });
    expect(hits).toHaveLength(3);
  });

  it("carries the bureau's display name, not just its code", async () => {
    const [hit] = await book.search("Dana Whitfield");
    expect(hit?.bureauCode).toBe("OIA");
    expect(hit?.bureauName).toBeTruthy();
    expect(hit?.bureauName).not.toBe("OIA");
  });

  it("gets a single entry by id", async () => {
    const [hit] = await book.search("Dana Whitfield");
    const got = await book.get(hit!.id);
    expect(got?.name).toBe("Dana Whitfield");
    expect(got?.email).toBe("dana.whitfield@fcc.gov");
  });

  it("returns null for an unknown id", async () => {
    expect(await book.get("stf_does_not_exist")).toBeNull();
  });
});
