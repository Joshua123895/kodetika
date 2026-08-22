import { describe, it, expect } from "vitest";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  toISO,
  parseISO,
  todayISO,
  shiftMonth,
  daysInMonth,
  firstWeekdayIndex,
  monthMatrix,
} from "../src/lib/calendar.js";

describe("the pieces", () => {
  it("names twelve months and seven days, Monday first", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(WEEKDAY_SHORT).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("formats and parses a round trip", () => {
    expect(toISO(2026, 7, 22)).toBe("2026-08-22");
    expect(parseISO("2026-08-22")).toEqual({ year: 2026, month: 7, day: 22 });
    expect(parseISO("")).toBeNull();
    expect(parseISO("22-08-2026")).toBeNull();
    expect(parseISO("2026-13-01")).toBeNull();
  });

  it("reads today from the local calendar, not UTC", () => {
    // Late evening on the 22nd is already the 23rd in UTC; the picker must
    // still open on the 22nd, which is the day the person is living in.
    expect(todayISO(new Date(2026, 7, 22, 23, 30))).toBe("2026-08-22");
  });
});

describe("month arithmetic", () => {
  it("rolls the year in both directions", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });

  it("counts days, leap year included", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 0)).toBe(31);
  });

  it("puts the 1st in the right column", () => {
    // 1 August 2026 is a Saturday, which is column 5 when Monday is 0.
    expect(firstWeekdayIndex(2026, 7)).toBe(5);
  });
});

describe("monthMatrix", () => {
  const weeks = monthMatrix(2026, 7); // August 2026

  it("is whole weeks of seven", () => {
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("holds every day of the month exactly once", () => {
    const own = weeks.flat().filter((c) => c.inMonth);
    expect(own).toHaveLength(31);
    expect(own[0].iso).toBe("2026-08-01");
    expect(own[30].iso).toBe("2026-08-31");
    expect(new Set(own.map((c) => c.iso)).size).toBe(31);
  });

  it("fills the corners from the neighbouring months", () => {
    const lead = weeks[0].filter((c) => !c.inMonth);
    expect(lead.map((c) => c.iso)).toEqual([
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
    ]);
    const tail = weeks[weeks.length - 1].filter((c) => !c.inMonth);
    for (const c of tail) expect(c.iso.startsWith("2026-09")).toBe(true);
  });

  it("handles a month that starts exactly on Monday with no lead", () => {
    // 1 June 2026 is a Monday.
    const june = monthMatrix(2026, 5);
    expect(june[0][0].iso).toBe("2026-06-01");
    expect(june[0][0].inMonth).toBe(true);
  });

  it("rolls February in a leap year", () => {
    const feb = monthMatrix(2028, 1).flat().filter((c) => c.inMonth);
    expect(feb).toHaveLength(29);
  });
});
