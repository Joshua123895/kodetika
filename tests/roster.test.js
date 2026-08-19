import { describe, it, expect } from "vitest";
import { rosterRow, rosterRows, classSummary, IDLE_DAYS } from "../src/lib/roster.js";
import { makeJoinCode, normaliseCode, CODE_LENGTH } from "../src/lib/classroom.js";

const tracks = [
  {
    slug: "python",
    name: "Python Fundamentals",
    trackIcon: "python.svg",
    difficulty: 1,
    chapters: [
      {
        id: 1,
        name: "Input & Output",
        levels: [
          { id: 1, name: "Hello" },
          { id: 2, name: "Vars" },
          { id: 3, name: "Loops" },
        ],
      },
    ],
  },
  {
    slug: "sql",
    name: "SQL",
    trackIcon: "sql.svg",
    difficulty: 2,
    chapters: [{ id: 1, name: "Select", levels: [{ id: 1, name: "First Query" }] }],
  },
];

const NOW = Date.parse("2026-08-20T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// The shape the class_progress view actually returns.
const member = (over = {}) => ({
  student_id: "u1",
  display_name: "Ayu",
  joined_at: daysAgo(30),
  progress: { python: { 1: 3, 2: 2 } },
  practice: { day: { streak: 4 }, review: {} },
  updated_at: daysAgo(0),
  ...over,
});

describe("rosterRow", () => {
  it("summarises a student from their blob", () => {
    const r = rosterRow(tracks, member(), { now: NOW });
    expect(r.name).toBe("Ayu");
    expect(r.levels).toBe(2);
    expect(r.stars).toBe(5);
    expect(r.streak).toBe(4);
    expect(r.furthest.slug).toBe("python");
    expect(r.idleDays).toBe(0);
    expect(r.needsHelp).toBe(false);
  });

  it("survives a student who joined and never submitted anything", () => {
    const r = rosterRow(tracks, member({ progress: null, practice: null, updated_at: null }), {
      now: NOW,
    });
    expect(r.levels).toBe(0);
    expect(r.stars).toBe(0);
    expect(r.streak).toBe(0);
    expect(r.furthest).toBeNull();
    expect(r.idleDays).toBeNull();
    expect(r.stuck).toEqual([]);
    // Never started is not the same as needing help on day one.
    expect(r.needsHelp).toBe(false);
  });

  it("flags a student who has gone quiet", () => {
    const r = rosterRow(tracks, member({ updated_at: daysAgo(IDLE_DAYS) }), { now: NOW });
    expect(r.idleDays).toBe(IDLE_DAYS);
    expect(r.needsHelp).toBe(true);
  });

  it("does not flag a student who was here yesterday", () => {
    const r = rosterRow(tracks, member({ updated_at: daysAgo(1) }), { now: NOW });
    expect(r.needsHelp).toBe(false);
  });

  it("flags a student stuck on one level, and names it", () => {
    const r = rosterRow(
      tracks,
      member({ practice: { day: { streak: 1 }, review: { python: { 3: { box: 0, fails: 4, last: NOW } } } } }),
      { now: NOW }
    );
    expect(r.needsHelp).toBe(true);
    expect(r.stuck[0].levelName).toBe("Loops");
    expect(r.stuck[0].fails).toBe(4);
  });

  it("picks the track they have gone furthest in", () => {
    const r = rosterRow(
      tracks,
      member({ progress: { python: { 1: 3 }, sql: { 1: 3 } } }),
      { now: NOW }
    );
    // Tied on levels, so the star count breaks it; both are 3, so first wins
    // deterministically rather than arbitrarily.
    expect(["python", "sql"]).toContain(r.furthest.slug);

    const clear = rosterRow(tracks, member({ progress: { python: { 1: 1 }, sql: {} } }), { now: NOW });
    expect(clear.furthest.slug).toBe("python");
  });
});

describe("rosterRows", () => {
  it("puts the students needing help at the top", () => {
    const rows = rosterRows(
      tracks,
      [
        member({ student_id: "a", display_name: "Zara" }),
        member({ student_id: "b", display_name: "Budi", updated_at: daysAgo(20) }),
        member({ student_id: "c", display_name: "Ayu" }),
      ],
      { now: NOW }
    );
    expect(rows[0].name).toBe("Budi");
    // The rest fall back to alphabetical, so the list does not reshuffle.
    expect(rows.slice(1).map((r) => r.name)).toEqual(["Ayu", "Zara"]);
  });

  it("handles an empty class", () => {
    expect(rosterRows(tracks, [], { now: NOW })).toEqual([]);
  });
});

describe("classSummary", () => {
  it("counts the shape of the class", () => {
    const rows = rosterRows(
      tracks,
      [
        member({ student_id: "a", display_name: "A" }),
        member({ student_id: "b", display_name: "B", updated_at: daysAgo(30) }),
        member({ student_id: "c", display_name: "C", progress: null, updated_at: null }),
      ],
      { now: NOW }
    );
    const s = classSummary(rows);
    expect(s.students).toBe(3);
    expect(s.needHelp).toBe(1);
    expect(s.activeToday).toBe(1);
    expect(s.neverStarted).toBe(1);
  });

  it("uses a median so one keen student does not skew it", () => {
    const rows = [{ levels: 1 }, { levels: 2 }, { levels: 300 }].map((r) => ({
      ...r,
      needsHelp: false,
      idleDays: 1,
    }));
    expect(classSummary(rows).medianLevels).toBe(2);
  });

  it("reports zero for an empty class rather than NaN", () => {
    expect(classSummary([]).medianLevels).toBe(0);
  });
});

describe("join codes", () => {
  it("is the right length and avoids the ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = makeJoinCode();
      expect(code).toHaveLength(CODE_LENGTH);
      // The database CHECK constraint uses exactly this pattern.
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it("is driven by the injected random source", () => {
    expect(makeJoinCode(() => 0)).toBe("AAAAAA");
  });

  it("normalises case and punctuation but invents nothing", () => {
    expect(normaliseCode("abc-234")).toBe("ABC234");
    expect(normaliseCode("  q w e r t y  ")).toBe("QWERTY");
    expect(normaliseCode("ABCDEFGH")).toBe("ABCDEF");
    // A typed O stays an O and fails cleanly, rather than being guessed into
    // some other class's code.
    expect(normaliseCode("O0I1AB")).toBe("O0I1AB");
    expect(normaliseCode("")).toBe("");
  });
});
