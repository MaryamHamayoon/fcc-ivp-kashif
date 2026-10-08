import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FORMAT_LABELS, type MeetingFormat, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatNumber } from "@/lib/format";
import type { Brief } from "./brief-data";

/**
 * The executive brief as a real PDF: one US Letter page, Public Sans, black on white, the
 * brand green kept for figures, eyebrows and one rule. Node-only — never import from a
 * client component.
 */

const GREEN = "#1f5b43";
const INK = "#141a17";
const MUTED = "#5c6660";
const HAIRLINE = "#d7ddd9";
const TRACK = "#e9efea";
const PLANNED = "#a9bfb2";
const SEGMENTS = [GREEN, "#6a9a83", "#a9bfb2"];

const FONT_DIR = join(process.cwd(), "lib", "reports", "fonts");
const SEAL = join(process.cwd(), "public", "brand", "fcc-seal.png");
const FACES = [
  { file: "PublicSans-Regular.ttf", fontWeight: 400 },
  { file: "PublicSans-SemiBold.ttf", fontWeight: 600 },
  { file: "PublicSans-Bold.ttf", fontWeight: 700 },
] as const;

let family: string | null = null;

/** Public Sans from disk, registered once per process; Helvetica if the files are not there. */
function fontFamily(): string {
  if (family) return family;
  const present = FACES.every((face) => existsSync(join(FONT_DIR, face.file)));
  if (present) {
    Font.register({ family: "Public Sans", fonts: FACES.map((face) => ({ src: join(FONT_DIR, face.file), fontWeight: face.fontWeight })) });
    family = "Public Sans";
  } else {
    console.warn("[brief] Public Sans not found under lib/reports/fonts; the PDF falls back to Helvetica.");
    family = "Helvetica";
  }
  Font.registerHyphenationCallback((word) => [word]);
  return family;
}

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 44, paddingHorizontal: 48, fontSize: 9, color: INK, lineHeight: 1.35 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  seal: { width: 40, height: 40 },
  eyebrow: { fontSize: 7, color: GREEN, fontWeight: 600, letterSpacing: 1.1, textTransform: "uppercase" },
  title: { fontSize: 16, fontWeight: 600, marginTop: 2 },
  date: { marginLeft: "auto", fontSize: 8, color: MUTED, textAlign: "right" },
  rule: { height: 1.5, backgroundColor: GREEN, marginTop: 12, marginBottom: 12 },
  headline: { fontSize: 11.5, fontWeight: 600, lineHeight: 1.4 },
  figures: { flexDirection: "row", gap: 8, marginTop: 14 },
  figure: { flex: 1, borderWidth: 0.75, borderColor: HAIRLINE, borderRadius: 4, padding: 8 },
  figureValue: { fontSize: 20, fontWeight: 700, color: GREEN, lineHeight: 1.1 },
  figureLabel: { fontSize: 8.5, fontWeight: 600, marginTop: 1 },
  figureDelta: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  figureNote: { fontSize: 6.5, color: MUTED, marginTop: 2, lineHeight: 1.3 },
  columns: { flexDirection: "row", gap: 20, marginTop: 16 },
  column: { flex: 1 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 5, paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: HAIRLINE },
  sectionEyebrow: { fontSize: 7, color: GREEN, fontWeight: 600, letterSpacing: 1.1, textTransform: "uppercase" },
  sectionUnit: { fontSize: 6.5, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2.2 },
  rowLabel: { flex: 1, fontSize: 8.5 },
  rowValue: { fontSize: 8.5, fontWeight: 600, minWidth: 22, textAlign: "right" },
  rowMeta: { fontSize: 7.5, color: MUTED },
  subEyebrow: { fontSize: 6.5, color: MUTED, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 6, marginBottom: 2 },
  code: { fontSize: 7.5, color: MUTED, minWidth: 58 },
  dateCell: { fontSize: 8, fontWeight: 600, width: 52 },
  empty: { fontSize: 8, color: MUTED, paddingVertical: 2 },
  clip: { maxLines: 1, textOverflow: "ellipsis" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  barLabel: { width: 78, fontSize: 8 },
  bars: { flex: 1, gap: 2 },
  track: { height: 4, backgroundColor: TRACK, borderRadius: 2, flexDirection: "row" },
  barValues: { width: 44, fontSize: 7.5, color: MUTED, textAlign: "right" },
  split: { height: 9, borderRadius: 4.5, flexDirection: "row", overflow: "hidden", backgroundColor: TRACK, marginTop: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4, fontSize: 8 },
  swatch: { width: 7, height: 7, borderRadius: 3.5 },
  footer: { position: "absolute", left: 48, right: 48, bottom: 26, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 0.75, borderTopColor: HAIRLINE, paddingTop: 6 },
});

const delta = (value: number, prior: number | null, priorLabel: string) => {
  if (prior === null) return `no ${priorLabel} data`;
  const diff = value - prior;
  if (diff === 0) return `Same as ${priorLabel}`;
  return `${diff > 0 ? "+" : "−"}${formatNumber(Math.abs(diff))} vs ${priorLabel}`;
};

function SectionHead({ title, unit }: { title: string; unit?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionEyebrow}>{title}</Text>
      {unit ? <Text style={styles.sectionUnit}>{unit}</Text> : null}
    </View>
  );
}

function Ranked({ rows }: { rows: { key: string; label: string; count: number }[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>Nothing counted yet.</Text>;
  return (
    <>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={[styles.rowLabel, styles.clip]}>
            {row.label}
          </Text>
          <Text style={styles.rowValue}>{formatNumber(row.count)}</Text>
        </View>
      ))}
    </>
  );
}

function BriefDocument({ brief, font }: { brief: Brief; font: string }) {
  const max = Math.max(1, ...brief.participants.flatMap((c) => [c.planned, c.actual]));
  const formatTotal = Math.max(1, ...[brief.formats.reduce((sum, f) => sum + f.count, 0)]);
  const seal = existsSync(SEAL) ? { data: readFileSync(SEAL), format: "png" as const } : null;
  const generated = formatDateNY(brief.generatedAt, "long");

  return (
    <Document title={`${brief.fyLabel} executive brief — International Visitors Program`} author="FCC International Visitors Program" subject="FCC Office of International Affairs" creator="FCC International Visitors Program" producer="FCC International Visitors Program">
      <Page size="LETTER" style={[styles.page, { fontFamily: font }]}>
        <View style={styles.header}>
          {/* A PDF image, not an HTML one: the seal is decorative and the PDF reader never labels it. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {seal ? <Image src={seal} style={styles.seal} /> : null}
          <View>
            <Text style={styles.eyebrow}>International Visitors Program</Text>
            <Text style={styles.title}>{brief.fyLabel} executive brief</Text>
          </View>
          <View style={styles.date}>
            <Text>{generated}</Text>
            <Text>Office of International Affairs</Text>
          </View>
        </View>
        <View style={styles.rule} />
        <Text style={styles.headline}>{brief.headline}</Text>

        <View style={styles.figures}>
          {brief.figures.map((figure) => (
            <View key={figure.id} style={styles.figure}>
              <Text style={styles.figureValue}>{formatNumber(figure.value)}</Text>
              <Text style={styles.figureLabel}>{figure.label}</Text>
              <Text style={styles.figureDelta}>{delta(figure.value, figure.prior, brief.priorLabel)}</Text>
              <Text style={styles.figureNote}>{figure.note}</Text>
            </View>
          ))}
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <SectionHead title="Where" unit="Meetings" />
            <Ranked rows={brief.where.countries} />
            <Text style={styles.subEyebrow}>Regions</Text>
            <Ranked rows={brief.where.regions} />
          </View>
          <View style={styles.column}>
            <SectionHead title="What" unit="Meetings" />
            <Ranked rows={brief.what} />
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <SectionHead title="Next 30 days" />
            {brief.next.length === 0 ? <Text style={styles.empty}>Nothing scheduled in the next thirty days.</Text> : null}
            {brief.next.map((m) => (
              <View key={m.meetingId} style={styles.row}>
                <Text style={styles.dateCell}>{formatDateNY(m.date, "weekday")}</Text>
                <Text style={[styles.rowLabel, styles.clip]}>
                  {m.countryName} · {m.orgName}
                </Text>
                <Text style={styles.rowMeta}>{STATUS_LABELS[m.status]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.column}>
            <SectionHead title="Needs attention" unit="Waiting on" />
            {brief.stuck.length === 0 ? <Text style={styles.empty}>Nothing is waiting on anyone.</Text> : null}
            {brief.stuck.map((m) => (
              <View key={m.meetingId} style={styles.row}>
                <Text style={styles.code}>{m.code}</Text>
                <Text style={[styles.rowLabel, styles.clip]}>
                  {m.title}
                </Text>
                <Text style={[styles.rowMeta, styles.clip]}>
                  {m.who} · {m.days}d
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <SectionHead title="Participants" unit="Planned / actual" />
            {brief.participants.length === 0 ? <Text style={styles.empty}>No participants recorded yet.</Text> : null}
            {brief.participants.map((c) => (
              <View key={c.category} style={styles.barRow}>
                <Text style={[styles.barLabel, styles.clip]}>
                  {c.label}
                </Text>
                <View style={styles.bars}>
                  <View style={styles.track}>
                    <View style={{ width: `${(c.planned / max) * 100}%`, backgroundColor: PLANNED, borderRadius: 2 }} />
                  </View>
                  <View style={styles.track}>
                    <View style={{ width: `${(c.actual / max) * 100}%`, backgroundColor: GREEN, borderRadius: 2 }} />
                  </View>
                </View>
                <Text style={styles.barValues}>
                  {formatNumber(c.planned)} / {formatNumber(c.actual)}
                </Text>
              </View>
            ))}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: PLANNED }]} />
                <Text>Planned</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: GREEN }]} />
                <Text>Actual</Text>
              </View>
            </View>
          </View>
          <View style={styles.column}>
            <SectionHead title="Format" />
            {brief.formats.length === 0 ? <Text style={styles.empty}>No meetings counted yet.</Text> : null}
            <View style={styles.split}>
              {brief.formats.map((f, i) => (
                <View key={f.key} style={{ width: `${(f.count / formatTotal) * 100}%`, backgroundColor: SEGMENTS[i % SEGMENTS.length] }} />
              ))}
            </View>
            <View style={styles.legend}>
              {brief.formats.map((f, i) => (
                <View key={f.key} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: SEGMENTS[i % SEGMENTS.length] }]} />
                  <Text>
                    {f.key in FORMAT_LABELS ? FORMAT_LABELS[f.key as MeetingFormat] : f.label} {Math.round((f.count / formatTotal) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Prepared by the IVP platform for the Office of International Affairs</Text>
          <Text>{generated}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** The brief as PDF bytes. */
export async function renderBriefPdf(brief: Brief): Promise<Uint8Array> {
  const font = fontFamily();
  const buffer = await renderToBuffer(<BriefDocument brief={brief} font={font} />);
  return new Uint8Array(buffer);
}
