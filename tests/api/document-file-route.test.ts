// @vitest-environment node
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/errors";
import type { OpenedDocument } from "@/lib/services/documents";
import { makeDocumentMeta } from "@/tests/fixtures/documents";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  open: vi.fn<(db: unknown, id: string, actor: unknown) => Promise<OpenedDocument>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/documents", () => ({ openDocument: h.open }));

const { GET } = await import("@/app/api/documents/[id]/file/route");

const viewer: SessionUser = { id: "usr_ingrid", name: "Ingrid Solberg", email: "ingrid@fcc.gov", role: "viewer", regionIds: [], staffId: null, bureauCode: null };
const bytes = new TextEncoder().encode("%PDF-1.4 hello");
const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const call = (id = "doc_artci_deck", query = "") => GET(new NextRequest(`http://localhost/api/documents/${id}/file${query}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = viewer;
  h.open.mockReset();
  h.open.mockResolvedValue({ meta: makeDocumentMeta({ filename: "deck.pdf" }), meetingCode: "IVP-2026-041", blob: { bytes, mime: "application/pdf", size: bytes.byteLength, sha256: sha } });
});

describe("GET /api/documents/:id/file", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("answers 404 when the document is unknown or unreadable", async () => {
    h.open.mockRejectedValue(new NotFoundError("Document"));
    const res = await call("doc_nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "That document could not be found." });
  });

  it("answers 404 for a link-only document", async () => {
    h.open.mockResolvedValue({ meta: makeDocumentMeta({ storageKey: "sharepoint://x", filename: null, mime: null }), meetingCode: "IVP-2026-041", blob: null });
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No file is stored for this document." });
  });

  it("streams the bytes inline with the headers a browser and a cache need", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="deck.pdf"; filename*=UTF-8''deck.pdf`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("etag")).toBe(`"${sha}"`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()))).toBe("%PDF-1.4 hello");
    expect(h.open.mock.calls[0]?.[1]).toBe("doc_artci_deck");
  });

  it("switches to an attachment for ?download=1 and names a file from the title when none was stored", async () => {
    h.open.mockResolvedValue({ meta: makeDocumentMeta({ filename: null, title: "Côte d'Ivoire deck" }), meetingCode: "IVP-2026-041", blob: { bytes, mime: "application/pdf", size: bytes.byteLength, sha256: null } });
    const res = await call("doc_artci_deck", "?download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="cote-d-ivoire-deck.pdf"; filename*=UTF-8''cote-d-ivoire-deck.pdf`);
    expect(res.headers.get("etag")).toBeNull();
  });

  it("keeps a non-ASCII stored filename readable in both disposition parameters", async () => {
    h.open.mockResolvedValue({ meta: makeDocumentMeta({ filename: "réunion — ordre du jour.pdf" }), meetingCode: "IVP-2026-041", blob: { bytes, mime: "application/pdf", size: bytes.byteLength, sha256: null } });
    const res = await call();
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="reunion - ordre du jour.pdf"; filename*=UTF-8''${encodeURIComponent("réunion — ordre du jour.pdf")}`);
  });
});
