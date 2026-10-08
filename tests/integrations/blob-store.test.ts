// @vitest-environment node
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { LocalBlobStore, sha256Hex } from "@/lib/integrations/blob-store";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.close());

const pdf = () => new TextEncoder().encode("%PDF-1.4 test");

describe("LocalBlobStore", () => {
  it("round-trips bytes and reports size and hash", async () => {
    const store = new LocalBlobStore(t.db);
    const put = await store.put(pdf(), { mime: "application/pdf" });
    expect(put.storageKey).toMatch(/^blob:\/\/blb_/);
    expect(put.size).toBe(pdf().length);
    expect(put.sha256).toBe(sha256Hex(pdf()));

    const got = await store.get(put.storageKey);
    expect(got?.mime).toBe("application/pdf");
    expect(got?.size).toBe(pdf().length);
    expect(got?.sha256).toBe(put.sha256);
    expect(Array.from(got!.bytes)).toEqual(Array.from(pdf()));
  });

  it("shares one row for identical bytes", async () => {
    const store = new LocalBlobStore(t.db);
    const a = await store.put(pdf(), { mime: "application/pdf" });
    const b = await store.put(pdf(), { mime: "application/pdf" });
    expect(b.storageKey).toBe(a.storageKey);
    expect(await t.db.select().from(s.documentBlobs)).toHaveLength(1);
  });

  it("returns null for links and unknown keys, and deletes quietly", async () => {
    const store = new LocalBlobStore(t.db);
    expect(await store.get("sharepoint://OIA/x.docx")).toBeNull();
    expect(await store.get("blob://blb_missing")).toBeNull();
    await expect(store.delete("sharepoint://OIA/x.docx")).resolves.toBeUndefined();
    await expect(store.delete("blob://blb_missing")).resolves.toBeUndefined();
  });

  it("deletes bytes it holds", async () => {
    const store = new LocalBlobStore(t.db);
    const put = await store.put(pdf(), { mime: "application/pdf" });
    await store.delete(put.storageKey);
    expect(await store.get(put.storageKey)).toBeNull();
  });

  it("hashes deterministically", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
