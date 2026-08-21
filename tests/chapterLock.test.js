import { describe, it, expect } from "vitest";
import {
  isChapterFinished,
  isChapterUnlocked,
  isLevelUnlocked,
  blockingChapterName,
} from "../src/utils/chapterLock.js";

// The gate applies to every track identically: it only sees the chapter list
// shape, so one fixture stands in for all fourteen.
const track = {
  slug: "t",
  chapters: [
    { id: "c1", name: "First Steps", levels: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { id: "c2", name: "Deeper Water", levels: [{ id: 4 }, { id: 5 }, { id: 6 }] },
    { id: "c3", name: "The Summit", levels: [{ id: 7 }, { id: 8 }, { id: 9 }] },
  ],
};

const starsFrom = (map) => (slug, levelId) => map[levelId] ?? 0;

describe("isChapterUnlocked", () => {
  it("keeps chapter 1 open with no progress at all", () => {
    expect(isChapterUnlocked(track, 0, starsFrom({}))).toBe(true);
  });

  it("locks later chapters for a fresh student", () => {
    expect(isChapterUnlocked(track, 1, starsFrom({}))).toBe(false);
    expect(isChapterUnlocked(track, 2, starsFrom({}))).toBe(false);
  });

  it("opens a chapter once the previous chapter's finale is done", () => {
    const getStars = starsFrom({ 3: 1 });
    expect(isChapterUnlocked(track, 1, getStars)).toBe(true);
    // Only one gate falls: chapter 3 still waits for chapter 2's finale.
    expect(isChapterUnlocked(track, 2, getStars)).toBe(false);
  });

  it("does not open on progress that stops short of the finale", () => {
    expect(isChapterUnlocked(track, 1, starsFrom({ 1: 3, 2: 3 }))).toBe(false);
  });

  it("keeps a chapter open when it already holds finished work (the safety valve)", () => {
    expect(isChapterUnlocked(track, 2, starsFrom({ 8: 2 }))).toBe(true);
  });

  it("opens everything for an admin", () => {
    expect(isChapterUnlocked(track, 2, starsFrom({}), { unlockAll: true })).toBe(true);
  });
});

describe("isLevelUnlocked", () => {
  it("carries the chapter's lock down to its levels", () => {
    const getStars = starsFrom({});
    expect(isLevelUnlocked(track, 2, getStars)).toBe(true);
    expect(isLevelUnlocked(track, 5, getStars)).toBe(false);
  });

  it("fails open for a level id no chapter claims", () => {
    expect(isLevelUnlocked(track, 999, starsFrom({}))).toBe(true);
  });
});

describe("the lock's edges", () => {
  it("isChapterFinished asks only about the final level", () => {
    expect(isChapterFinished("t", track.chapters[0], starsFrom({ 1: 3, 2: 3 }))).toBe(false);
    expect(isChapterFinished("t", track.chapters[0], starsFrom({ 3: 1 }))).toBe(true);
  });

  it("blockingChapterName points at the chapter before, and at nothing for the first", () => {
    expect(blockingChapterName(track, 1)).toBe("First Steps");
    expect(blockingChapterName(track, 0)).toBeNull();
  });
});
