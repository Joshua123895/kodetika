import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import initSqlJs from "sql.js";
import { runScript, gradeSql, wantsOrder, MAX_ROWS } from "../src/sql/sqlCore.js";
import { validateStructure } from "../src/utils/structureValidator.js";
import { dedent } from "../src/data/levelSource.js";
import { countLines } from "./starBudgets.audit.js";

// The SQL track's equivalent of tests/levels.test.js. There, every Python `sol`
// is executed by real CPython; here every SQL `sol` is executed by real SQLite —
// the same WebAssembly build the browser loads, read off disk instead of fetched
// over HTTP. One engine, so unlike the web track there is no second environment
// that could disagree with the first.
//
// Nothing in this file states what a query should return. It cannot: the level's
// own answer, run against the level's own database, IS the expected result. What
// these tests check is that the levels are gradable at all — that the answer runs,
// that it produces something to compare, and that the starter does not already
// pass.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACK_DIR = join(ROOT, "src/data/tracks");

const SQL = await initSqlJs({
  wasmBinary: readFileSync(join(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm")),
});

// Discovered by content, not by filename: `sql: true` on the level is what the
// app branches on, so the tests split the corpus the same way. A SQL level in
// any track file lands here, and never in tests/webLevels.test.js.
const tracks = [];
for (const file of readdirSync(TRACK_DIR).filter((f) => f.endsWith(".yaml")).sort()) {
  const track = load(readFileSync(join(TRACK_DIR, file), "utf8"));
  const levels = [];
  for (const chapter of track.chapters ?? []) {
    for (const level of chapter.levels ?? []) {
      if (level.sql) levels.push({ chapter: chapter.name, level });
    }
  }
  if (levels.length) tracks.push({ file, track, levels });
}

/** Everything LevelPage feeds the engine as setup: the track database, then any per-level seed. */
const setupFor = (track, level) => (track.db ?? "") + (level.seed ? `\n${level.seed}` : "");

const run = (track, level, source) => runScript(SQL, setupFor(track, level), dedent(source ?? ""));

/** Grades `source` exactly as LevelPage does, source-checks included. */
async function submit(track, level, source) {
  const sol = dedent(level.sol ?? "");
  const student = run(track, level, source);
  const expected = run(track, level, sol);
  const verdict = gradeSql(student, expected, {
    ordered: level.ordered ?? wantsOrder(sol),
    matchCols: Boolean(level.matchCols),
  });
  if (!verdict.passed) return verdict;
  if (!level.checks) return verdict;
  // parseChecks in tracks.js renames these; the shape validateStructure wants is
  // the parsed one, so mirror the two keys the SQL track uses.
  const res = await validateStructure(source, {
    contains: level.checks.has,
    absent: level.checks.no,
    failMessage: level.checks.msg,
  });
  return res.valid ? verdict : { passed: false, failures: [res.error] };
}

describe("SQL track", () => {
  it("has levels to check", () => {
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.flatMap((t) => t.levels).length).toBeGreaterThan(0);
  });

  for (const { track, levels } of tracks) {
    it(`${track.name}: the track database builds cleanly`, () => {
      const result = runScript(SQL, track.db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
      expect(result.error).toBeNull();
      expect(result.grid.rows.flat()).toEqual(["authors", "books"]);
    });

    // The three properties the YAML comment calls load-bearing. Each one is what
    // makes some level have exactly ONE correct answer, and each would be easy to
    // break while editing the data for an unrelated reason.
    describe(`${track.name}: the data the levels depend on`, () => {
      const q = (sql) => runScript(SQL, track.db, sql).grid.rows;

      it("has a distinct year and page count for every book, so ORDER BY cannot tie", () => {
        expect(q("SELECT COUNT(DISTINCT year), COUNT(DISTINCT pages), COUNT(*) FROM books")[0]).toEqual([12, 12, 12]);
      });

      it("has exactly one author with no books, so LEFT JOIN has something to show", () => {
        const rows = q(
          "SELECT COUNT(*) FROM authors WHERE id NOT IN (SELECT DISTINCT author_id FROM books)"
        );
        expect(rows[0][0]).toBe(1);
      });

      it("has a distinct count per genre and total per country, so the grouped sorts cannot tie", () => {
        const genres = q("SELECT COUNT(*) AS n FROM books GROUP BY genre").map((r) => r[0]);
        expect(new Set(genres).size).toBe(genres.length);
        const countries = q(
          `SELECT SUM(books.copies) FROM books
           JOIN authors ON books.author_id = authors.id
           GROUP BY authors.country
           HAVING SUM(books.copies) > 5`
        ).map((r) => r[0]);
        expect(new Set(countries).size).toBe(countries.length);
      });
    });

    for (const { chapter, level } of levels) {
      describe(`${track.name} / ${chapter}`, () => {
        it(`${level.name}: the official answer runs and grades something`, async () => {
          const result = run(track, level, level.sol);
          expect(result.error, `SQLite rejected the solution: ${result.error}`).toBeNull();
          expect(result.truncated).toBe(false);

          // A level is only gradable if the answer leaves evidence: rows to
          // compare, or a database that differs from the untouched seed. One with
          // neither would pass an empty submission.
          const untouched = run(track, level, "");
          const changedData = JSON.stringify(result.state) !== JSON.stringify(untouched.state);
          const hasRows = Boolean(result.grid && result.grid.rows.length > 0);
          expect(hasRows || changedData, "the solution neither returns rows nor changes the data").toBe(true);

          // And it must pass its own grading — including its own source-checks,
          // so a `has:` pattern that does not match the intended answer is caught
          // here rather than by the first student to write it correctly.
          const verdict = await submit(track, level, level.sol);
          expect(verdict.failures).toEqual([]);
        });

        it(`${level.name}: the starter does not already pass`, async () => {
          const verdict = await submit(track, level, level.start ?? "");
          expect(verdict.passed).toBe(false);
        });

        // Same invariant tests/starBudgets.test.js enforces on the Python tracks.
        it(`${level.name}: the line budget is reachable`, () => {
          const needed = countLines(dedent(level.sol ?? ""));
          const budget = parseInt(String(level.max).split("/")[0], 10);
          expect(budget).toBeGreaterThanOrEqual(needed);
        });

        // Identical restriction to the web levels, for the identical reason: the
        // AST forms parse the source with Python's `ast`, so one here would boot a
        // 20MB interpreter only to be told that SQL is not Python.
        it(`${level.name}: uses only pattern source-checks`, () => {
          const astKeys = ["cls", "fn", "mth", "inh", "not", "classes", "functions", "methods", "inheritance"];
          for (const key of astKeys) expect(level.checks?.[key]).toBeUndefined();
        });

        // SQL keywords are case-insensitive, so every pattern in this track must
        // be too — a check that only accepted `GROUP BY` would reject the same
        // query typed in lower case, which is the same query.
        it(`${level.name}: every source-check is case-insensitive`, () => {
          for (const pattern of level.checks?.has ?? []) {
            // A pattern with no letters in it (`>`, for instance) has no case to
            // be insensitive about.
            if (!/[a-z]/i.test(pattern)) continue;
            expect(pattern.startsWith("(?i)"), `\`${pattern}\` should start with (?i)`).toBe(true);
          }
        });
      });
    }
  }
});

// Levels are graded against the result of their own answer, which means a student
// who writes a DIFFERENT correct query must pass too. These are the alternatives
// most likely to be typed, and each one failing would look to the student like
// the level being broken.
describe("equivalent answers a student might write", () => {
  const sqlTrack = tracks.find((t) => t.track.slug === "sql");
  const find = (name) => {
    const hit = sqlTrack.levels.find((l) => l.level.name === name);
    if (!hit) throw new Error(`no level named ${name}`);
    return hit.level;
  };

  const cases = [
    // Lower case, no trailing semicolon, all on one line.
    ["Every Column", "select * from books"],
    // No spaces around `=`, double quotes are NOT valid here so single stay.
    ["Filtering Rows", "SELECT * FROM books WHERE genre='Science Fiction';"],
    // ASC spelled out, where the answer leaves it implied.
    ["Sorting Results", "SELECT title, year FROM books ORDER BY year ASC;"],
    // Identifying the row by id instead of by title.
    ["Changing a Row", "UPDATE books SET copies = 9 WHERE id = 9;"],
    // Grouping by the name rather than the id — same groups, since names are unique.
    [
      "Counting Across Tables",
      `SELECT authors.name, COUNT(books.id) FROM authors
       LEFT JOIN books ON books.author_id = authors.id
       GROUP BY authors.name;`,
    ],
    // Table aliases, which is how most people actually write joins.
    [
      "Two Tables at Once",
      "SELECT b.title, a.name FROM books b JOIN authors a ON b.author_id = a.id;",
    ],
  ];

  for (const [name, source] of cases) {
    it(`${name}: accepts "${source.replace(/\s+/g, " ").slice(0, 48)}…"`, async () => {
      const verdict = await submit(sqlTrack.track, find(name), source);
      expect(verdict.failures).toEqual([]);
    });
  }
});

// The other half of that coin. Comparing against the answer's RESULT means a
// student can sometimes reach the right rows without doing the thing the level
// teaches, which is what the `checks:` patterns are for. These assert they work.
describe("answers that reach the right result the wrong way", () => {
  const sqlTrack = tracks.find((t) => t.track.slug === "sql");
  const find = (name) => sqlTrack.levels.find((l) => l.level.name === name).level;

  const cases = [
    ["Counting Rows", "SELECT 12;"],
    ["Adding Up", "SELECT 32;"],
    ["Distinct Values", "SELECT 'Fantasy' UNION SELECT 'Fiction' UNION SELECT 'Science Fiction';"],
    ["The Average", "SELECT 278.166667;"],
    ["Filtering Groups", "SELECT 'Fiction', 8 UNION SELECT 'Science Fiction', 3;"],
  ];

  for (const [name, source] of cases) {
    it(`${name}: rejects "${source.slice(0, 44)}"`, async () => {
      const level = find(name);
      // The point of these: the RESULT is right, so only the source-check can
      // tell them apart. If that ever stops being true the test is worthless, so
      // assert it explicitly.
      const student = run(sqlTrack.track, level, source);
      const expected = run(sqlTrack.track, level, dedent(level.sol));
      expect(
        gradeSql(student, expected, { ordered: false, matchCols: Boolean(level.matchCols) }).passed,
        "this cheat no longer produces the right result, so it proves nothing"
      ).toBe(true);

      const verdict = await submit(sqlTrack.track, level, source);
      expect(verdict.passed).toBe(false);
      expect(verdict.failures[0]).toBe(level.checks.msg);
    });
  }
});

describe("the grader", () => {
  const setup = "CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1,'x'),(2,'y'),(3,'z');";
  const go = (student, reference, opts) =>
    gradeSql(runScript(SQL, setup, student), runScript(SQL, setup, reference), opts);

  it("passes an identical query", () => {
    expect(go("SELECT * FROM t", "SELECT * FROM t").passed).toBe(true);
  });

  it("reports a syntax error in the student's own words", () => {
    const r = go("SELCT * FROM t", "SELECT * FROM t");
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("syntax error");
  });

  it("names the column count when it differs", () => {
    const r = go("SELECT a FROM t", "SELECT a, b FROM t");
    expect(r.failures[0]).toContain("2");
  });

  it("counts the rows when the filter is wrong", () => {
    const r = go("SELECT a FROM t WHERE a > 1", "SELECT a FROM t WHERE a > 2");
    expect(r.failures[0]).toContain("returned 2 rows");
  });

  it("ignores row order unless the answer asked for one", () => {
    expect(go("SELECT a FROM t ORDER BY a DESC", "SELECT a FROM t").passed).toBe(true);
  });

  it("enforces row order when the answer asked for one", () => {
    const r = go("SELECT a FROM t ORDER BY a DESC", "SELECT a FROM t ORDER BY a", { ordered: true });
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("Row 1");
  });

  it("ignores column names by default", () => {
    expect(go("SELECT a AS whatever FROM t", "SELECT a FROM t").passed).toBe(true);
  });

  it("checks column names when the level is about them", () => {
    const r = go("SELECT a FROM t", "SELECT a AS total FROM t", { matchCols: true });
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("total");
  });

  it("treats an integer and an integer-valued float as equal", () => {
    expect(go("SELECT 4", "SELECT 4.0").passed).toBe(true);
  });

  it("does not treat different numbers as equal", () => {
    expect(go("SELECT 4.5", "SELECT 4.6").passed).toBe(false);
  });

  it("catches an UPDATE that hit every row instead of one", () => {
    const r = go("UPDATE t SET b = 'q'", "UPDATE t SET b = 'q' WHERE a = 1");
    expect(r.passed).toBe(false);
  });

  it("catches a DELETE that removed the wrong rows", () => {
    expect(go("DELETE FROM t WHERE a > 1", "DELETE FROM t WHERE a > 2").passed).toBe(false);
  });

  it("notices a table that was never created", () => {
    const r = go("SELECT 1", "CREATE TABLE u (id INTEGER)");
    expect(r.failures[0]).toContain("`u`");
  });

  it("notices a created table whose columns are named wrongly", () => {
    const r = go("CREATE TABLE u (ident INTEGER)", "CREATE TABLE u (id INTEGER)");
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("id");
  });

  it("asks for a SELECT when the level wants rows and the student ran none", () => {
    const r = go("UPDATE t SET b = 'q' WHERE a = 1", "SELECT * FROM t");
    expect(r.failures[0]).toContain("SELECT");
  });

  it("reports an empty result as a row count rather than as nothing at all", () => {
    const r = go("SELECT a FROM t WHERE a > 99", "SELECT a FROM t");
    expect(r.failures[0]).toContain("returned 0 rows");
  });
});

describe("the runtime", () => {
  it("stops a runaway recursive query instead of collecting rows forever", () => {
    // Nothing here stops at a row count, so an uncapped reader never returns.
    // The engine cannot be interrupted mid-step, which is why the browser runs it
    // in a worker as well; the cap is what makes THIS reader terminate.
    const r = runScript(
      SQL,
      "",
      "WITH RECURSIVE forever(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM forever) SELECT n FROM forever"
    );
    expect(r.truncated).toBe(true);
    expect(r.grid.rows.length).toBe(MAX_ROWS);
  });

  it("runs the statements before a failing one, and reports the failure", () => {
    const r = runScript(SQL, "CREATE TABLE t (a INTEGER)", "INSERT INTO t VALUES (1); SELCT 2");
    expect(r.error).toContain("syntax error");
    expect(r.state.t.rows).toEqual(["1"]);
  });

  it("keeps a semicolon inside a string literal out of the statement split", () => {
    const r = runScript(SQL, "", "SELECT 'a;b' AS x");
    expect(r.grid.rows).toEqual([["a;b"]]);
  });

  it("returns no grid for a script that only writes", () => {
    const r = runScript(SQL, "CREATE TABLE t (a INTEGER)", "INSERT INTO t VALUES (1);");
    expect(r.grid).toBeNull();
    expect(r.error).toBeNull();
  });

  it("gives an empty SELECT its column names anyway", () => {
    const r = runScript(SQL, "CREATE TABLE t (a INTEGER, b TEXT)", "SELECT a, b FROM t");
    expect(r.grid.cols).toEqual(["a", "b"]);
    expect(r.grid.rows).toEqual([]);
  });

  it("leaves the last SELECT on screen when a script runs several", () => {
    const r = runScript(SQL, "", "SELECT 1 AS first; SELECT 2 AS second;");
    expect(r.grid.cols).toEqual(["second"]);
  });

  it("seeds each run from scratch, so one run cannot affect the next", () => {
    const setup = "CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1);";
    runScript(SQL, setup, "DELETE FROM t;");
    expect(runScript(SQL, setup, "SELECT COUNT(*) FROM t").grid.rows).toEqual([[1]]);
  });

  it("only pins row order for a query that asked for it", () => {
    expect(wantsOrder("SELECT * FROM t")).toBe(false);
    expect(wantsOrder("select title from books order by year")).toBe(true);
  });
});

describe("case-insensitive source checks", () => {
  it("accepts either spelling of a SQL keyword", async () => {
    const checks = { contains: ["(?i)group\\s+by"], failMessage: "nope" };
    expect((await validateStructure("select x from t GROUP BY x", checks)).valid).toBe(true);
    expect((await validateStructure("select x from t group by x", checks)).valid).toBe(true);
    expect((await validateStructure("select x from t", checks)).valid).toBe(false);
  });

  it("leaves a pattern without the prefix case-sensitive", async () => {
    const checks = { contains: ["GROUP BY"], failMessage: "nope" };
    expect((await validateStructure("group by x", checks)).valid).toBe(false);
  });
});
