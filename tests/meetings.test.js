import { describe, it, expect } from "vitest";
import {
  PAYMENT_STEPS,
  PAYMENT_LABELS,
  cyclePayment,
  nextMeetingNumber,
  sortMeetings,
  paymentSummary,
} from "../src/lib/meetings.js";

const meet = (num, payment = "unpaid") => ({ num, payment });

describe("cyclePayment", () => {
  it("walks not asked -> asked -> paid and comes back round", () => {
    expect(cyclePayment("unpaid")).toBe("asked");
    expect(cyclePayment("asked")).toBe("paid");
    expect(cyclePayment("paid")).toBe("unpaid");
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

describe("paymentSummary", () => {
  it("counts each standing and skips empty groups", () => {
    const book = [meet(1, "paid"), meet(2, "paid"), meet(3, "asked"), meet(4, "unpaid")];
    expect(paymentSummary(book)).toBe("2 paid, 1 asked, 1 not asked");
    expect(paymentSummary([meet(1, "paid")])).toBe("1 paid");
  });

  it("is empty for an empty book", () => {
    expect(paymentSummary([])).toBe("");
  });
});
