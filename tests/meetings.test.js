import { describe, it, expect } from "vitest";
import {
  PAYMENT_STEPS,
  PAYMENT_LABELS,
  cyclePayment,
  formatMetDate,
  linkHref,
  nextMeetingNumber,
  sortMeetings,
  sortBook,
  paymentSummary,
} from "../src/lib/meetings.js";

const meet = (num, payment = "unpaid") => ({ num, payment });

describe("cyclePayment", () => {
  it("walks not paid -> paid -> cancelled and comes back round", () => {
    expect(cyclePayment("unpaid")).toBe("paid");
    expect(cyclePayment("paid")).toBe("cancelled");
    expect(cyclePayment("cancelled")).toBe("unpaid");
  });

  it("recovers to the first step from a value it does not know", () => {
    expect(cyclePayment("banana")).toBe("unpaid");
  });

  it("labels every step", () => {
    for (const s of PAYMENT_STEPS) expect(PAYMENT_LABELS[s]).toBeTruthy();
  });
});

describe("nextMeetingNumber", () => {
  it("offers 1 for an empty book", () => {
    expect(nextMeetingNumber([])).toBe(1);
    expect(nextMeetingNumber(null)).toBe(1);
  });

  it("offers max + 1, not count + 1, so a book that starts at 12 continues at 13", () => {
    // The teacher tracked meetings 1 to 11 on paper and logs 12 as their first
    // row here. The next offer has to be 13.
    expect(nextMeetingNumber([meet(12)])).toBe(13);
  });

  it("survives rows arriving out of order", () => {
    expect(nextMeetingNumber([meet(14), meet(12), meet(13)])).toBe(15);
  });
});

describe("sortMeetings", () => {
  it("reads newest-first and leaves the input alone", () => {
    const input = [meet(12), meet(14), meet(13)];
    expect(sortMeetings(input).map((m) => m.num)).toEqual([14, 13, 12]);
    expect(input.map((m) => m.num)).toEqual([12, 14, 13]);
  });
});

describe("sortBook", () => {
  const book = [
    { num: 12, met_on: "2026-08-01", note: "loops", payment: "paid" },
    { num: 13, met_on: "2026-08-08", note: "arrays", payment: "unpaid" },
    { num: 14, met_on: "2026-08-15", note: "Big project", payment: "cancelled" },
  ];

  it("sorts by number in either direction", () => {
    expect(sortBook(book, "num", "asc").map((m) => m.num)).toEqual([12, 13, 14]);
    expect(sortBook(book, "num", "desc").map((m) => m.num)).toEqual([14, 13, 12]);
  });

  it("sorts dates as dates and descriptions without caring about case", () => {
    expect(sortBook(book, "met_on", "asc")[0].num).toBe(12);
    expect(sortBook(book, "note", "asc").map((m) => m.note)).toEqual(["arrays", "Big project", "loops"]);
  });

  it("sorts status by stage, not paid first ascending", () => {
    expect(sortBook(book, "payment", "asc").map((m) => m.payment)).toEqual(["unpaid", "paid", "cancelled"]);
  });

  it("falls back to newest-first on a key it does not know, and copies rather than mutates", () => {
    expect(sortBook(book, "vibes").map((m) => m.num)).toEqual([14, 13, 12]);
    expect(book[0].num).toBe(12);
  });
});

describe("formatMetDate", () => {
  it("spells out the day and writes dd-mm-yyyy", () => {
    expect(formatMetDate("2026-08-22", "en-US")).toBe("Saturday, 22-08-2026");
    expect(formatMetDate("2026-01-05", "en-US")).toBe("Monday, 05-01-2026");
  });

  it("is harmless on nothing and on junk", () => {
    expect(formatMetDate("")).toBe("");
    expect(formatMetDate("not-a-date")).toBe("not-a-date");
  });
});

describe("linkHref", () => {
  it("leaves a full address alone and completes a bare one", () => {
    expect(linkHref("https://meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(linkHref("meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(linkHref("  zoom.us/j/123  ")).toBe("https://zoom.us/j/123");
    expect(linkHref("")).toBe("");
  });
});

describe("paymentSummary", () => {
  it("counts each standing and skips empty groups", () => {
    const book = [meet(1, "paid"), meet(2, "paid"), meet(3, "cancelled"), meet(4, "unpaid")];
    expect(paymentSummary(book)).toBe("2 paid, 1 not paid, 1 cancelled");
    expect(paymentSummary([meet(1, "paid")])).toBe("1 paid");
  });

  it("is empty for an empty book", () => {
    expect(paymentSummary([])).toBe("");
  });
});
