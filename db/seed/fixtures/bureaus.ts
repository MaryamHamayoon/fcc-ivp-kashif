/**
 * FCC bureaus and offices from the client's BureausAndOffices list (the Office of the Secretary
 * and Office of Workplace Diversity are marked "does not exist anymore" there and are omitted).
 * OCH is included so the "Office of the Chairman attending" flag has a home.
 */
export type BureauFixture = { code: string; name: string; kind: "bureau" | "office"; sortOrder: number; staffCount: number };

export const BUREAUS: readonly BureauFixture[] = [
  { code: "CGB", name: "Consumer and Governmental Affairs Bureau", kind: "bureau", sortOrder: 10, staffCount: 5 },
  { code: "EB", name: "Enforcement Bureau", kind: "bureau", sortOrder: 20, staffCount: 4 },
  { code: "MB", name: "Media Bureau", kind: "bureau", sortOrder: 30, staffCount: 4 },
  { code: "PSHSB", name: "Public Safety and Homeland Security Bureau", kind: "bureau", sortOrder: 40, staffCount: 5 },
  { code: "SB", name: "Space Bureau", kind: "bureau", sortOrder: 50, staffCount: 6 },
  { code: "WTB", name: "Wireless Telecommunications Bureau", kind: "bureau", sortOrder: 60, staffCount: 6 },
  { code: "WCB", name: "Wireline Competition Bureau", kind: "bureau", sortOrder: 70, staffCount: 5 },
  { code: "OALJ", name: "Office of Administrative Law Judges", kind: "office", sortOrder: 110, staffCount: 2 },
  { code: "OCBO", name: "Office of Communications Business Opportunities", kind: "office", sortOrder: 120, staffCount: 2 },
  { code: "OEA", name: "Office of Economics and Analytics", kind: "office", sortOrder: 130, staffCount: 5 },
  { code: "OET", name: "Office of Engineering and Technology", kind: "office", sortOrder: 140, staffCount: 6 },
  { code: "OGC", name: "Office of General Counsel", kind: "office", sortOrder: 150, staffCount: 3 },
  { code: "OIG", name: "Office of Inspector General", kind: "office", sortOrder: 160, staffCount: 2 },
  { code: "OIA", name: "Office of International Affairs", kind: "office", sortOrder: 170, staffCount: 9 },
  { code: "OLA", name: "Office of Legislative Affairs", kind: "office", sortOrder: 180, staffCount: 2 },
  { code: "OMD", name: "Office of the Managing Director", kind: "office", sortOrder: 190, staffCount: 3 },
  { code: "OMR", name: "Office of Media Relations", kind: "office", sortOrder: 200, staffCount: 2 },
  { code: "OCH", name: "Office of the Chairman", kind: "office", sortOrder: 210, staffCount: 2 },
];

export const BUREAU_BY_CODE: ReadonlyMap<string, BureauFixture> = new Map(BUREAUS.map((b) => [b.code, b]));
