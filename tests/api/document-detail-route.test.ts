// @vitest-environment node
import { NextRequest } from "next/server";
import { DocumentDetailResponse } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/errors";
import type { DocumentDetail } from "@/lib/services/library";
import { makeLibraryItem } from "@/tests/fixtures/documents";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  detail: vi.fn<(db: unknown, id: string, actor: unknown) => Promise<DocumentDetail>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/library", () => ({ getDocumentDetail: h.detail }));

const { GET } = await import("@/app/api/documents/[id]/route");

const viewer: SessionUser = { id: "usr_ingrid", name: "Ingrid Solberg", email: "ingrid@fcc.gov", role: "viewer", regionIds: [], staffId: null, bureauCode: null };

const deck = makeLibraryItem();
const older = makeLibraryItem({ id: "doc_artci_deck_v0", version: 0, isCurrent: false });

const call = (id = "doc_artci_deck") => GET(new NextRequest(`http://localhost/api/documents/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = viewer;
  h.detail.mockReset();
  h.detail.mockResolvedValue({ item: deck, versions: [deck, older], source: null });
});

describe("GET /api/documents/:id", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    expect(h.detail).not.toHaveBeenCalled();
  });

  it("answers 404 when the document is unknown or outside the reader's scope", async () => {
    h.detail.mockRejectedValue(new NotFoundError("Document"));
    const res = await call("doc_nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Document not found." });
  });

  it("returns the document, every version of its slot and its source, in the shape the drawer reads", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = DocumentDetailResponse.parse(await res.json());
    expect(body.item.id).toBe("doc_artci_deck");
    expect(body.item.addedAt).toBeInstanceOf(Date);
    expect(body.versions.map((v) => v.id)).toEqual(["doc_artci_deck", "doc_artci_deck_v0"]);
    expect(body.source).toBeNull();
    expect(h.detail).toHaveBeenCalledWith(expect.anything(), "doc_artci_deck", expect.objectContaining({ id: "usr_ingrid", role: "viewer" }));
  });
});
