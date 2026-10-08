/** Business-day arithmetic on UTC calendar days (Mon–Fri; no holiday calendar in Phase 1). */

const DAY = 86_400_000;

const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY);

/** 1970-01-01 was a Thursday (4, with Sunday = 0). */
const isWeekend = (dayNum: number) => {
  const wd = (((dayNum + 4) % 7) + 7) % 7;
  return wd === 0 || wd === 6;
};

/** Business days after `from` up to and including `to`; 0 when `to` is not after `from`. */
export function businessDaysBetween(from: Date, to: Date): number {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (b <= a) return 0;
  let n = 0;
  for (let d = a + 1; d <= b; d++) if (!isWeekend(d)) n++;
  return n;
}

/** Same wall-clock offset within the day, `days` business days later (earlier when negative). */
export function addBusinessDays(from: Date, days: number): Date {
  let d = dayNumber(from);
  let left = Math.abs(days);
  const direction = days < 0 ? -1 : 1;
  while (left > 0) {
    d += direction;
    if (!isWeekend(d)) left--;
  }
  const msIntoDay = from.getTime() - dayNumber(from) * DAY;
  return new Date(d * DAY + msIntoDay);
}
