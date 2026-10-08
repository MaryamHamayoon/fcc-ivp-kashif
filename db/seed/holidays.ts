/**
 * The federal holidays of 5 U.S.C. 6103, so the seed never books a visit on a day the FCC is
 * closed. A holiday counts on its own date and on the weekday it is observed: a Saturday
 * holiday is observed the Friday before, a Sunday one the Monday after.
 */

type CalendarDay = { year: number; month: number; day: number };

const DAY = 86_400_000;
const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);
const weekdayOf = (t: number) => new Date(t).getUTCDay();

/** The `n`th given weekday (0 = Sunday) of a month. */
const nth = (year: number, month: number, weekday: number, n: number) => {
  const first = utc(year, month, 1);
  return first + (((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7) * DAY;
};

/** The last given weekday of a month. */
const last = (year: number, month: number, weekday: number) => {
  const end = utc(year, month + 1, 0);
  return end - ((weekdayOf(end) - weekday + 7) % 7) * DAY;
};

/** A fixed-date holiday and, when it falls on a weekend, the weekday it is observed on. */
const fixed = (year: number, month: number, day: number) => {
  const t = utc(year, month, day);
  const wd = weekdayOf(t);
  return wd === 6 ? [t, t - DAY] : wd === 0 ? [t, t + DAY] : [t];
};

function holidaysOf(year: number): number[] {
  return [
    ...fixed(year, 1, 1),
    nth(year, 1, 1, 3), // Birthday of Martin Luther King, Jr.
    nth(year, 2, 1, 3), // Washington's Birthday
    last(year, 5, 1), // Memorial Day
    ...(year >= 2021 ? fixed(year, 6, 19) : []), // Juneteenth
    ...fixed(year, 7, 4),
    nth(year, 9, 1, 1), // Labor Day
    nth(year, 10, 1, 2), // Columbus Day
    ...fixed(year, 11, 11),
    nth(year, 11, 4, 4), // Thanksgiving Day
    ...fixed(year, 12, 25),
    ...fixed(year + 1, 1, 1), // a Saturday New Year's Day is observed on December 31
  ];
}

export function isFederalHoliday({ year, month, day }: CalendarDay): boolean {
  return holidaysOf(year).includes(utc(year, month, day));
}
