import type { LibraryOptions } from "@/components/documents/options";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS } from "@/lib/domain/types";
import type { DocumentMeta } from "@/lib/integrations";

/** A realistic library row: the deck from a confirmed Côte d'Ivoire visit, starred for reuse. */
export function makeLibraryItem(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: "doc_artci_deck",
    meetingId: "mtg_artci",
    meetingCode: "IVP-2026-041",
    meetingTitle: "Spectrum sharing study visit",
    meetingStatus: "confirmed",
    scheduledStart: new Date("2026-09-15T14:00:00Z"),
    countryCode: "CI",
    countryName: "Côte d'Ivoire",
    regionId: "af",
    regionName: "Africa",
    orgId: "artci",
    orgName: "Autorité de Régulation des Télécommunications",
    orgShortName: "ARTCI",
    fiscalYear: 2026,
    kind: "briefing_deck",
    kindLabel: "Briefing Deck",
    title: "Spectrum sharing — FCC briefing deck",
    filename: "spectrum-sharing-fcc-briefing-deck.pdf",
    mime: "application/pdf",
    size: 184_320,
    version: 1,
    isCurrent: true,
    reusable: true,
    sourceDocumentId: null,
    sourceMeetingCode: null,
    sourceMeetingId: null,
    topics: [
      { id: "spectrum-sharing", name: "Spectrum Sharing" },
      { id: "spectrum-auctions", name: "Spectrum Auctions" },
    ],
    addedAt: new Date("2026-08-20T15:30:00Z"),
    addedByName: "Priya Raman",
    preview: "pdf",
    storageScheme: "seed",
    link: null,
    ...over,
  };
}

/** The same document as the store sees it. */
export function makeDocumentMeta(over: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: "doc_artci_deck",
    meetingId: "mtg_artci",
    kind: "briefing_deck",
    title: "Spectrum sharing — FCC briefing deck",
    storageKey: "seed://doc_artci_deck",
    version: 1,
    reusable: true,
    addedById: "usr_priya",
    addedAt: new Date("2026-08-20T15:30:00Z"),
    filename: "spectrum-sharing-fcc-briefing-deck.pdf",
    mime: "application/pdf",
    size: 184_320,
    sha256: null,
    sourceDocumentId: null,
    ...over,
  };
}

/** What the library toolbar can offer: every value that exists on a small seeded shelf. */
export function makeLibraryOptions(over: Partial<LibraryOptions> = {}): LibraryOptions {
  return {
    kinds: DOCUMENT_KINDS.map((value) => ({ value, label: DOCUMENT_KIND_LABELS[value] })),
    topics: [
      { value: "spectrum-sharing", label: "Spectrum Sharing" },
      { value: "spectrum-auctions", label: "Spectrum Auctions" },
      { value: "submarine-cables", label: "Submarine Cables" },
    ],
    countries: [
      { value: "CI", label: "Côte d'Ivoire", hint: "Africa" },
      { value: "KE", label: "Kenya", hint: "Africa" },
      { value: "GB", label: "United Kingdom", hint: "Europe" },
    ],
    regions: [
      { value: "af", label: "Africa" },
      { value: "eur", label: "Europe" },
    ],
    organizations: [
      { value: "artci", label: "ARTCI" },
      { value: "ca-kenya", label: "Communications Authority of Kenya" },
    ],
    fiscalYears: [2027, 2026, 2025],
    reusableTopics: [
      { key: "spectrum-sharing", label: "Spectrum Sharing", count: 7 },
      { key: "submarine-cables", label: "Submarine Cables", count: 3 },
    ],
    reusableTotal: 9,
    ...over,
  };
}
