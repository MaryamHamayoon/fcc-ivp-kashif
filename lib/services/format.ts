import { NY_TZ } from "@/lib/domain/fiscal-year";

const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, month: "long", day: "numeric", year: "numeric" });
const short = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, month: "numeric", day: "numeric" });

/** "November 4, 2026 at 11:00 AM" in Washington time — for activity bodies and notices. */
export const fmtDateTime = (d: Date) => dateTime.format(d).replace(", ", " ").replace(/(\d{4}) /, "$1 at ");
export const fmtDate = (d: Date) => date.format(d);
/** "8/26" — the way the Excel notes wrote dates. */
export const fmtShort = (d: Date) => short.format(d);
