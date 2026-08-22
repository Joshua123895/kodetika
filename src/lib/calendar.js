// The month grid behind the date picker. Pure: no React, no DOM, no Date
// parsing of strings — every date is built from explicit numbers.
//
// Everything here works in LOCAL time on purpose. `new Date("2026-08-22")` is
// UTC midnight, which west of Greenwich reads back as the 21st; the meetings
// table was bitten by exactly that twice. Dates in this app are calendar days,
// not instants, so they are carried as {y, m, d} and only ever formatted.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Monday first: this is a class schedule, and the week a course runs on starts
// on a Monday nearly everywhere it is taught.
export const WEEKDAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n) => String(n).padStart(2, "0");

/** "yyyy-mm-dd" from explicit parts. Month is 0-based, as Date uses it. */
export function toISO(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** {year, month, day} from "yyyy-mm-dd", or null when it is not one. */
export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Today, as this machine's calendar sees it. */
export function todayISO(now = new Date()) {
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Steps the month, rolling the year. */
export function shiftMonth(year, month, delta) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** How many days the month holds; day 0 of the next month is the last of this one. */
export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** Which column the 1st falls in, with Monday as column 0. */
export function firstWeekdayIndex(year, month) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

/**
 * The grid a month is drawn as: whole weeks of seven, with the neighbouring
 * months' days filling the corners so every row is complete. `inMonth` says
 * which are the month's own.
 */
export function monthMatrix(year, month) {
  const lead = firstWeekdayIndex(year, month);
  const count = daysInMonth(year, month);
  const prev = shiftMonth(year, month, -1);
  const prevCount = daysInMonth(prev.year, prev.month);
  const next = shiftMonth(year, month, 1);

  const cells = [];
  for (let i = lead - 1; i >= 0; i--) {
    const day = prevCount - i;
    cells.push({ day, iso: toISO(prev.year, prev.month, day), inMonth: false });
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ day, iso: toISO(year, month, day), inMonth: true });
  }
  let day = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day, iso: toISO(next.year, next.month, day), inMonth: false });
    day += 1;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
