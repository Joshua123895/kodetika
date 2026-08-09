import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isChapterUnlocked, isLevelUnlocked } from "../src/utils/chapterLock.js";

// `ADMIN_EMAILS` is read at module load, so every case has to reset the module
// registry after stubbing the env — importing once at the top would freeze the
// list to whatever the first test set.
async function loadAdmin(list) {
  vi.resetModules();
  if (list === undefined) vi.unstubAllEnvs();
  else vi.stubEnv("VITE_ADMIN_EMAILS", list);
  return import("../src/lib/admin.js");
}

describe("isAdminEmail", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("matches a listed address, case- and space-insensitively", async () => {
    const { isAdminEmail } = await loadAdmin(" Owner@Example.com , second@example.com ");
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("  OWNER@EXAMPLE.COM ")).toBe(true);
    expect(isAdminEmail("second@example.com")).toBe(true);
  });

  it("rejects anyone not listed, and anyone at all when the list is empty", async () => {
    const { isAdminEmail } = await loadAdmin("owner@example.com");
    expect(isAdminEmail("student@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);

    const empty = await loadAdmin("");
    expect(empty.ADMIN_EMAILS).toEqual([]);
    expect(empty.isAdminEmail("owner@example.com")).toBe(false);
  });
});

describe("the admin unlock bypass", () => {
  // Two chapters, nothing completed: chapter 2 is locked for a student.
  const track = {
    slug: "demo",
    chapters: [
      { id: 1, levels: [{ id: 101 }, { id: 102 }] },
      { id: 2, levels: [{ id: 201 }, { id: 202 }] },
    ],
  };
  const noStars = () => 0;

  it("opens a chapter the normal rule keeps shut, and only when asked", () => {
    expect(isChapterUnlocked(track, 1, noStars)).toBe(false);
    expect(isChapterUnlocked(track, 1, noStars, {})).toBe(false);
    expect(isChapterUnlocked(track, 1, noStars, { unlockAll: false })).toBe(false);
    expect(isChapterUnlocked(track, 1, noStars, { unlockAll: true })).toBe(true);
  });

  it("passes through the level-level gate too", () => {
    expect(isLevelUnlocked(track, 201, noStars)).toBe(false);
    expect(isLevelUnlocked(track, 201, noStars, { unlockAll: true })).toBe(true);
    // Chapter 1 was never gated, admin or not.
    expect(isLevelUnlocked(track, 101, noStars)).toBe(true);
  });
});
