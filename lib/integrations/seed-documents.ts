import { eq, inArray } from "drizzle-orm";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { Db } from "@/lib/db/factory";
import * as s from "@/lib/db/schema";
import { DOCUMENT_KIND_LABELS, type DocumentKind, FORMAT_LABELS, type MeetingFormat, PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS, type ParticipantCategory } from "@/lib/domain/types";
import { formatDateNY, formatRange } from "@/lib/format";
import type { BlobContent } from "./blob-store";

/**
 * Seeded documents are real files, rendered from the record they belong to the moment someone
 * opens them. Nothing is stored at seed time, so a sandbox server start costs nothing extra, and
 * every agenda, roster and readout agrees with the meeting it sits on — because it is drawn
 * from that meeting. Output is deterministic for a row: the same input gives the same bytes.
 */

export type SeedPdfInput = {
  kind: DocumentKind;
  title: string;
  version: number;
  addedAt: Date;
  meeting: {
    code: string;
    title: string;
    purpose: string | null;
    format: MeetingFormat;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    location: string | null;
    countryName: string;
    orgName: string;
    leadName: string | null;
    fiscalYear: number;
  };
  topics: string[];
  agenda: { startsAt: Date | null; endsAt: Date | null; title: string; briefers: string[] }[];
  participants: { name: string; title: string | null; category: ParticipantCategory; organization: string | null }[];
  experts: { name: string; bureau: string | null; role: string }[];
  candidateDates: Date[];
};

/* ------------------------------- typography ------------------------------- */

const LETTER: [number, number] = [612, 792];
const LANDSCAPE: [number, number] = [792, 612];
const MARGIN = 54;

const INK = rgb(0.09, 0.11, 0.1);
const MUTED = rgb(0.42, 0.46, 0.44);
const BRAND = rgb(0.12, 0.36, 0.26);
const RULE = rgb(0.85, 0.87, 0.86);
const WASH = rgb(0.95, 0.96, 0.955);

const REPLACEMENTS: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " ", "→": "->" };

/**
 * The standard fonts speak WinAnsi only. Typographic punctuation is mapped to its plain form,
 * accented Latin letters lose marks the encoding lacks (Việt → Viet), and anything else becomes
 * a question mark rather than a thrown error — a seeded file must always open.
 */
export function safeText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x100 && code !== 0x7f && (code >= 0x20 || ch === "\n")) {
      out += ch;
      continue;
    }
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const base = ch.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const baseCode = base.codePointAt(0) ?? 0;
    out += base.length > 0 && baseCode < 0x100 && baseCode >= 0x20 ? base : "?";
  }
  return out;
}

type Fonts = { regular: PDFFont; bold: PDFFont };

/** A cursor that flows text down a page and starts a new one when the margin is reached. */
class Writer {
  page!: PDFPage;
  y = 0;
  private readonly width: number;
  private readonly height: number;
  private pages = 0;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
    size: [number, number],
    private readonly footerText: string,
  ) {
    this.width = size[0];
    this.height = size[1];
    this.newPage();
  }

  get contentWidth(): number {
    return this.width - MARGIN * 2;
  }

  newPage(): void {
    this.page = this.doc.addPage([this.width, this.height]);
    this.pages += 1;
    this.y = this.height - MARGIN;
    const footer = safeText(`${this.footerText}  ·  ${this.pages}`);
    this.page.drawText(footer, { x: MARGIN, y: MARGIN / 2, size: 8, font: this.fonts.regular, color: MUTED });
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN) this.newPage();
  }

  gap(points: number): void {
    this.y -= points;
  }

  rule(): void {
    this.ensure(8);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: this.width - MARGIN, y: this.y }, thickness: 0.6, color: RULE });
    this.y -= 8;
  }

  /** Small, spaced, brand-colored label above a block. */
  eyebrow(text: string): void {
    this.ensure(14);
    this.page.drawText(safeText(text.toUpperCase()), { x: MARGIN, y: this.y - 8, size: 7.5, font: this.fonts.bold, color: BRAND });
    this.y -= 16;
  }

  heading(text: string, size = 18): void {
    this.paragraph(text, { size, font: this.fonts.bold, color: INK, leading: size * 1.2 });
  }

  line(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}): void {
    const size = opts.size ?? 10;
    this.ensure(size * 1.4);
    this.page.drawText(safeText(text), { x: opts.x ?? MARGIN, y: this.y - size, size, font: opts.font ?? this.fonts.regular, color: opts.color ?? INK });
    this.y -= size * 1.45;
  }

  paragraph(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; leading?: number; width?: number; x?: number } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.fonts.regular;
    const leading = opts.leading ?? size * 1.45;
    const width = opts.width ?? this.contentWidth;
    for (const raw of safeText(text).split("\n")) {
      for (const lineText of wrap(raw, font, size, width)) {
        this.ensure(leading);
        this.page.drawText(lineText, { x: opts.x ?? MARGIN, y: this.y - size, size, font, color: opts.color ?? INK });
        this.y -= leading;
      }
    }
  }

  bullet(text: string): void {
    const size = 10;
    this.ensure(size * 1.45);
    this.page.drawText("-", { x: MARGIN + 4, y: this.y - size, size, font: this.fonts.regular, color: MUTED });
    this.paragraph(text, { size, x: MARGIN + 16, width: this.contentWidth - 16 });
  }

  /** Label/value pairs in two columns — the meta block under every title. */
  facts(pairs: [string, string][]): void {
    const colWidth = this.contentWidth / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      this.ensure(26);
      const row = pairs.slice(i, i + 2);
      row.forEach(([label, value], col) => {
        const x = MARGIN + col * colWidth;
        this.page.drawText(safeText(label.toUpperCase()), { x, y: this.y - 7, size: 6.5, font: this.fonts.bold, color: MUTED });
        this.page.drawText(clip(safeText(value), this.fonts.regular, 10, colWidth - 12), { x, y: this.y - 20, size: 10, font: this.fonts.regular, color: INK });
      });
      this.y -= 28;
    }
  }

  /** A hairline table; the header row is washed, numbers are set as given. */
  table(columns: { label: string; width: number }[], rows: string[][]): void {
    const rowHeight = 18;
    const drawHeader = () => {
      this.ensure(rowHeight);
      this.page.drawRectangle({ x: MARGIN, y: this.y - rowHeight + 4, width: this.contentWidth, height: rowHeight, color: WASH });
      let x = MARGIN + 6;
      for (const col of columns) {
        this.page.drawText(safeText(col.label.toUpperCase()), { x, y: this.y - 8, size: 6.5, font: this.fonts.bold, color: MUTED });
        x += col.width;
      }
      this.y -= rowHeight;
    };
    drawHeader();
    for (const row of rows) {
      if (this.y - rowHeight < MARGIN) {
        this.newPage();
        drawHeader();
      }
      let x = MARGIN + 6;
      row.forEach((cell, i) => {
        const col = columns[i]!;
        this.page.drawText(clip(safeText(cell), this.fonts.regular, 9, col.width - 10), { x, y: this.y - 9, size: 9, font: this.fonts.regular, color: INK });
        x += col.width;
      });
      this.y -= rowHeight;
      this.page.drawLine({ start: { x: MARGIN, y: this.y + 4 }, end: { x: this.width - MARGIN, y: this.y + 4 }, thickness: 0.4, color: RULE });
    }
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clip(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) out = out.slice(0, -1);
  return `${out}...`;
}

/* --------------------------------- content -------------------------------- */

const when = (m: SeedPdfInput["meeting"]): string => (m.scheduledStart ? formatRange(m.scheduledStart, m.scheduledEnd) : "Date to be set");

function metaFacts(input: SeedPdfInput): [string, string][] {
  const m = input.meeting;
  return [
    ["Meeting", m.code],
    ["Delegation", `${m.orgName} · ${m.countryName}`],
    ["When", when(m)],
    ["Format", `${FORMAT_LABELS[m.format]}${m.location ? ` · ${m.location}` : ""}`],
    ["OIA lead", m.leadName ?? "To be assigned"],
    ["Version", `v${input.version} · ${formatDateNY(input.addedAt, "short")}`],
  ];
}

function titleBlock(w: Writer, input: SeedPdfInput, subtitle: string): void {
  w.eyebrow(`FCC International Visitors Program · FY${input.meeting.fiscalYear}`);
  w.heading(input.title, 20);
  w.line(subtitle, { size: 10.5, color: MUTED });
  w.gap(6);
  w.rule();
  w.facts(metaFacts(input));
  w.rule();
  w.gap(4);
}

function agendaRows(input: SeedPdfInput): string[][] {
  return input.agenda.map((item) => [
    item.startsAt && item.endsAt ? `${formatDateNY(item.startsAt, "time")} – ${formatDateNY(item.endsAt, "time")}` : "—",
    item.title,
    item.briefers.length ? item.briefers.join(", ") : "OIA",
  ]);
}

function renderWorkPlan(w: Writer, input: SeedPdfInput): void {
  titleBlock(w, input, "Internal work plan — not for distribution");
  w.eyebrow("Purpose");
  w.paragraph(input.meeting.purpose ?? `Briefings for the ${input.meeting.orgName} delegation on ${input.topics.join(", ") || "program topics"}.`);
  w.gap(8);
  w.eyebrow("Topics requested");
  for (const topic of input.topics) w.bullet(topic);
  if (input.topics.length === 0) w.line("To be confirmed with the delegation.", { color: MUTED });
  w.gap(8);
  w.eyebrow("Candidate dates");
  if (input.candidateDates.length === 0) w.line("None proposed yet.", { color: MUTED });
  for (const date of input.candidateDates) w.bullet(formatDateNY(date, "long"));
  w.gap(8);
  w.eyebrow("FCC experts");
  if (input.experts.length === 0) w.line("Requests go out once topics are ranked.", { color: MUTED });
  for (const expert of input.experts) w.bullet(`${expert.name}${expert.bureau ? ` (${expert.bureau})` : ""} — ${expert.role}`);
}

function renderAgenda(w: Writer, input: SeedPdfInput, draft: boolean): void {
  titleBlock(w, input, draft ? "Draft agenda — circulated for comment" : "Agenda");
  if (input.agenda.length === 0) {
    w.eyebrow("Sessions");
    w.line("Sessions are set once the date is accepted.", { color: MUTED });
    return;
  }
  w.eyebrow("Sessions");
  w.table(
    [
      { label: "Time", width: 118 },
      { label: "Session", width: 270 },
      { label: "Briefers", width: 116 },
    ],
    agendaRows(input),
  );
  w.gap(10);
  w.line("All times Eastern. Prepared by the Office of International Affairs.", { size: 8.5, color: MUTED });
}

function renderDeck(w: Writer, input: SeedPdfInput): void {
  // Title slide
  w.gap(150);
  w.eyebrow("Federal Communications Commission · Office of International Affairs");
  w.heading(input.title, 26);
  w.gap(4);
  w.line(`${input.meeting.orgName} · ${input.meeting.countryName}`, { size: 13, color: MUTED });
  w.line(when(input.meeting), { size: 11, color: MUTED });
  // One slide per topic
  const topics = input.topics.length ? input.topics : ["Program overview"];
  const purpose = input.meeting.purpose ?? "The Commission's approach, current proceedings and lessons from implementation.";
  for (const topic of topics) {
    w.newPage();
    w.eyebrow(input.meeting.code);
    w.heading(topic, 22);
    w.gap(10);
    w.bullet(`Why it matters for ${input.meeting.countryName}: ${purpose}`);
    w.bullet("Where the FCC stands today: rules in force, proceedings under way, and what is next on the docket.");
    w.bullet("Questions for discussion: what the delegation is weighing at home, and where the Commission's experience applies.");
  }
  w.newPage();
  w.gap(150);
  w.heading("Thank you", 26);
  w.line("Office of International Affairs · fcc.gov/international", { size: 11, color: MUTED });
}

function renderParticipants(w: Writer, input: SeedPdfInput): void {
  titleBlock(w, input, "Participant list, as received");
  if (input.participants.length === 0) {
    w.line("No named participants yet; the roster is requested from the delegation.", { color: MUTED });
    return;
  }
  for (const category of PARTICIPANT_CATEGORIES) {
    const rows = input.participants.filter((p) => p.category === category);
    if (rows.length === 0) continue;
    w.eyebrow(`${PARTICIPANT_CATEGORY_LABELS[category]} · ${rows.length}`);
    w.table(
      [
        { label: "Name", width: 170 },
        { label: "Title", width: 190 },
        { label: "Organization", width: 144 },
      ],
      rows.map((p) => [p.name, p.title ?? "—", p.organization ?? "—"]),
    );
    w.gap(10);
  }
}

function renderBios(w: Writer, input: SeedPdfInput): void {
  titleBlock(w, input, "Delegation biographies");
  const people = input.participants.filter((p) => p.category !== "fcc");
  if (people.length === 0) w.line("Biographies follow once the roster is confirmed.", { color: MUTED });
  for (const person of people) {
    w.ensure(60);
    w.line(person.name, { size: 12, font: w.fonts.bold });
    w.line([person.title, person.organization].filter(Boolean).join(" · ") || PARTICIPANT_CATEGORY_LABELS[person.category], { size: 9.5, color: MUTED });
    w.paragraph(`${person.name.split(" ")[0]} leads work on ${input.topics[0] ?? "communications policy"} for ${person.organization ?? input.meeting.orgName} and is joining the visit to compare approaches with the Commission's.`);
    w.gap(10);
  }
}

function renderReadout(w: Writer, input: SeedPdfInput): void {
  titleBlock(w, input, "Readout — written after the visit");
  const attended = input.participants.length;
  w.eyebrow("Summary");
  const session = { in_person: "an in-person", virtual: "a virtual", hybrid: "a hybrid" }[input.meeting.format];
  w.paragraph(
    `${input.meeting.orgName} (${input.meeting.countryName}) met FCC staff ${input.meeting.scheduledStart ? `on ${formatDateNY(input.meeting.scheduledStart, "long")}` : "this fiscal year"} in ${session} session${attended ? ` with ${attended} named participant${attended === 1 ? "" : "s"}` : ""}. ${input.meeting.purpose ?? "The discussion covered the delegation's priorities and the Commission's experience."}`,
  );
  w.gap(8);
  w.eyebrow("Topics discussed");
  for (const topic of input.topics) w.bullet(topic);
  w.gap(8);
  w.eyebrow("Briefers");
  const briefers = input.experts.filter((e) => e.role !== "attendee");
  if (briefers.length === 0) w.line("OIA staff.", { color: MUTED });
  for (const e of briefers) w.bullet(`${e.name}${e.bureau ? ` (${e.bureau})` : ""}`);
  w.gap(8);
  w.eyebrow("Follow-ups");
  w.bullet("Share the presented materials with the delegation's point of contact.");
  w.bullet(`Offer a follow-on exchange on ${input.topics[1] ?? input.topics[0] ?? "the next topic the delegation raises"} within the fiscal year.`);
}

function renderMemo(w: Writer, input: SeedPdfInput): void {
  titleBlock(w, input, DOCUMENT_KIND_LABELS[input.kind]);
  w.paragraph(input.meeting.purpose ?? `Supporting material for the ${input.meeting.orgName} engagement.`);
  w.gap(8);
  if (input.topics.length) {
    w.eyebrow("Topics");
    for (const topic of input.topics) w.bullet(topic);
  }
}

/** Renders one seeded document. Pure: no database, no clock, no randomness. */
export async function renderSeedPdf(input: SeedPdfInput): Promise<Uint8Array> {
  // updateMetadata would stamp pdf-lib's producer and the wall clock, and with them non-determinism.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const landscape = input.kind === "briefing_deck";
  const w = new Writer(doc, fonts, landscape ? LANDSCAPE : LETTER, `${input.meeting.code} · ${DOCUMENT_KIND_LABELS[input.kind]}`);

  switch (input.kind) {
    case "work_plan":
      renderWorkPlan(w, input);
      break;
    case "agenda_draft":
      renderAgenda(w, input, true);
      break;
    case "agenda_final":
      renderAgenda(w, input, false);
      break;
    case "briefing_deck":
      renderDeck(w, input);
      break;
    case "participant_list":
      renderParticipants(w, input);
      break;
    case "bio_packet":
      renderBios(w, input);
      break;
    case "readout":
      renderReadout(w, input);
      break;
    default:
      renderMemo(w, input);
  }

  doc.setTitle(safeText(input.title));
  doc.setSubject(safeText(`${input.meeting.code} — ${input.meeting.title}`));
  doc.setAuthor("FCC Office of International Affairs");
  doc.setProducer("FCC International Visitors Program");
  doc.setCreator("FCC International Visitors Program");
  doc.setCreationDate(input.addedAt);
  doc.setModificationDate(input.addedAt);
  return doc.save({ useObjectStreams: false });
}

/* ------------------------------- from the record ------------------------------- */

/** Loads the document and the record around it, renders the PDF; null when the row is gone. */
export async function synthesizeSeedDocument(db: Db, documentId: string): Promise<BlobContent | null> {
  const doc = await db.query.meetingDocuments.findFirst({
    where: eq(s.meetingDocuments.id, documentId),
    with: {
      meeting: {
        with: {
          primaryCountry: true,
          organization: true,
          lead: true,
          topics: { with: { topic: true }, orderBy: (t, { asc }) => [asc(t.rank)] },
          agendaItems: { orderBy: (a, { asc }) => [asc(a.sortOrder)] },
          participants: { with: { organization: true }, orderBy: (p, { asc }) => [asc(p.category), asc(p.name)] },
          experts: { with: { staff: true } },
          candidateDates: { orderBy: (d, { asc }) => [asc(d.start)] },
        },
      },
    },
  });
  if (!doc) return null;

  const m = doc.meeting;
  const brieferIds = [...new Set(m.agendaItems.flatMap((a) => (Array.isArray(a.brieferStaffIds) ? (a.brieferStaffIds as string[]) : [])))];
  const staff = brieferIds.length ? await db.select({ id: s.staffDirectory.id, name: s.staffDirectory.name }).from(s.staffDirectory).where(inArray(s.staffDirectory.id, brieferIds)) : [];
  const staffName = new Map(staff.map((p) => [p.id, p.name]));

  const bytes = await renderSeedPdf({
    kind: doc.kind,
    title: doc.title,
    version: doc.version,
    addedAt: doc.addedAt,
    meeting: {
      code: m.code,
      title: m.title,
      purpose: m.purpose,
      format: m.format,
      scheduledStart: m.scheduledStart,
      scheduledEnd: m.scheduledEnd,
      location: m.location,
      countryName: m.primaryCountry.name,
      orgName: m.organization?.shortName ?? m.organization?.name ?? "Delegation",
      leadName: m.lead?.name ?? null,
      fiscalYear: m.fiscalYear,
    },
    topics: m.topics.map((t) => t.topic.name),
    agenda: m.agendaItems.map((a) => ({
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      title: a.title,
      briefers: (Array.isArray(a.brieferStaffIds) ? (a.brieferStaffIds as string[]) : []).map((id) => staffName.get(id)).filter((name): name is string => Boolean(name)),
    })),
    participants: m.participants.map((p) => ({ name: p.name, title: p.title, category: p.category, organization: p.organization?.shortName ?? p.organization?.name ?? null })),
    experts: m.experts.map((e) => ({ name: e.staff.name, bureau: e.bureauCode ?? e.staff.bureauCode, role: e.role })),
    candidateDates: m.candidateDates.filter((d) => d.status !== "withdrawn" && d.status !== "declined").map((d) => d.start),
  });

  return { bytes, mime: "application/pdf", size: bytes.byteLength, sha256: null };
}
