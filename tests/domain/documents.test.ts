import { currentVersions, formatBytes, isPreviewable, MAX_UPLOAD_BYTES, nextVersion, reuseCheck, safeFilename, storageScheme, typeLabel, validateUpload } from "@/lib/domain/documents";

describe("versions", () => {
  it("starts at 1 and follows the highest version of the same kind", () => {
    expect(nextVersion([], "agenda_final")).toBe(1);
    expect(nextVersion([{ kind: "agenda_final", version: 2 }, { kind: "agenda_draft", version: 5 }], "agenda_final")).toBe(3);
  });

  it("marks only the highest version of each kind as current", () => {
    const a1 = { id: "a1", kind: "agenda_final" as const, version: 1 };
    const a2 = { id: "a2", kind: "agenda_final" as const, version: 2 };
    const d1 = { id: "d1", kind: "briefing_deck" as const, version: 1 };
    const current = currentVersions([a1, a2, d1]);
    expect(current.has(a2)).toBe(true);
    expect(current.has(a1)).toBe(false);
    expect(current.has(d1)).toBe(true);
  });
});

describe("uploads", () => {
  it("accepts a PDF under the cap and names its extension", () => {
    expect(validateUpload({ name: "deck.PDF", mime: "application/pdf", size: 1024 })).toEqual({ ok: true, ext: "pdf", mime: "application/pdf" });
  });

  it("rejects anything over 4 MB with a plain reason", () => {
    const result = validateUpload({ name: "big.pdf", mime: "application/pdf", size: MAX_UPLOAD_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/4 MB/);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ name: "empty.pdf", mime: "application/pdf", size: 0 }).ok).toBe(false);
  });

  it("rejects a type that is not on the list and says what is", () => {
    const result = validateUpload({ name: "x.exe", mime: "application/x-msdownload", size: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/PDF, Word, PowerPoint, Excel, images, text/);
  });

  it("falls back to the file extension when the browser sends a generic type", () => {
    expect(validateUpload({ name: "notes.md", mime: "application/octet-stream", size: 10 })).toEqual({ ok: true, ext: "md", mime: "text/markdown" });
    expect(validateUpload({ name: "photo.JPEG", mime: "", size: 10 })).toEqual({ ok: true, ext: "jpg", mime: "image/jpeg" });
  });
});

describe("preview and names", () => {
  it("knows what the drawer can show inline", () => {
    expect(isPreviewable("application/pdf")).toBe("pdf");
    expect(isPreviewable("image/png")).toBe("image");
    expect(isPreviewable("text/csv")).toBe("text");
    expect(isPreviewable("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBeNull();
    expect(isPreviewable(null)).toBeNull();
  });

  it("names the type for people", () => {
    expect(typeLabel("application/pdf")).toBe("PDF");
    expect(typeLabel("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("PowerPoint");
    expect(typeLabel(null)).toBe("Link");
  });

  it("builds a download name from the title", () => {
    expect(safeFilename("Final agenda — ARTCI study visit", "pdf")).toBe("final-agenda-artci-study-visit.pdf");
    expect(safeFilename("Côte d'Ivoire deck", "pptx")).toBe("cote-d-ivoire-deck.pptx");
    expect(safeFilename("   ", "pdf")).toBe("document.pdf");
  });

  it("reads the storage scheme", () => {
    expect(storageScheme("blob://blb_1")).toBe("blob");
    expect(storageScheme("seed://doc_1")).toBe("seed");
    expect(storageScheme("sharepoint://OIA/x.docx")).toBe("link");
    expect(storageScheme(null)).toBe("none");
  });

  it("formats sizes for people", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(120 * 1024)).toBe("120 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("reuse", () => {
  const source = { id: "doc_a", meetingId: "mtg_1", storageKey: "blob://b1" };

  it("allows a file into another meeting's slot", () => {
    expect(reuseCheck(source, { meetingId: "mtg_2", docs: [] }, "briefing_deck")).toEqual({ ok: true });
  });

  it("refuses the source meeting itself", () => {
    expect(reuseCheck(source, { meetingId: "mtg_1", docs: [] }, "briefing_deck").ok).toBe(false);
  });

  it("refuses a slot that already holds these exact bytes", () => {
    expect(reuseCheck(source, { meetingId: "mtg_2", docs: [{ storageKey: "blob://b1", kind: "briefing_deck" }] }, "briefing_deck").ok).toBe(false);
    expect(reuseCheck(source, { meetingId: "mtg_2", docs: [{ storageKey: "blob://b1", kind: "other" }] }, "briefing_deck").ok).toBe(true);
  });

  it("refuses a link-only document, which has no bytes to carry", () => {
    expect(reuseCheck({ ...source, storageKey: "sharepoint://x" }, { meetingId: "mtg_2", docs: [] }, "briefing_deck").ok).toBe(false);
    expect(reuseCheck({ ...source, storageKey: null }, { meetingId: "mtg_2", docs: [] }, "briefing_deck").ok).toBe(false);
  });

  it("carries seeded files, which IVP can always render", () => {
    expect(reuseCheck({ ...source, storageKey: "seed://doc_a" }, { meetingId: "mtg_2", docs: [] }, "briefing_deck")).toEqual({ ok: true });
  });
});
