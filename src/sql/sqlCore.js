// Everything about running and grading a SQL level that does NOT depend on the
// environment. The sql.js namespace is passed in rather than imported, because
// the two places this runs load the engine differently: the browser worker
// fetches the .wasm over HTTP, while the test suite reads it off disk. Keeping
// that split out here means CI grades with the very same code — and the very
// same SQLite build — that a student's browser does.
//
// That is the whole point. The web track's hardest bug was jsdom and Chrome
// computing different values from identical CSS; there is no equivalent trap
// here, and there won't be, as long as there is only ever one engine.

// A recursive CTE with no stopping condition returns rows forever, one per
// step(), so an uncapped loop would grow the array until the tab dies. The cap
// is high enough that no honest beginner query reaches it and low enough that
// hitting it costs nothing.
export const MAX_ROWS = 500;

/** SQLite hands back numbers, strings, null and blobs; comparison needs strings. */
function cell(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    // Integer-valued floats collapse onto the integer deliberately: AVG() may
    // return 4 and SUM()/COUNT() 4.0 for the same question, and a student who
    // computed the average the long way is not wrong. Real fractions are
    // rounded because the two spellings can differ in the last binary place.
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6);
  }
  if (typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return `blob(${v.length})`;
  return String(v);
}

/** One row as a single comparable string. */
function rowKey(row) {
  return row.map(cell).join("");
}

/** A row as a student-readable line, for the failure panel. */
export function formatRow(row) {
  return row.map((v) => (v === null || v === undefined ? "NULL" : String(v))).join(" | ");
}

/**
 * Does this query pin down its own row order?
 *
 * Without an ORDER BY, SQLite is free to return rows in whatever order its plan
 * happens to produce, and two correct answers to the same question (a join
 * versus a subquery, say) legitimately disagree. So order is only graded when
 * the level's own answer asks for one — which is exactly when the level is
 * teaching ORDER BY and the order IS the answer.
 */
export function wantsOrder(sql) {
  return /\border\s+by\b/i.test(String(sql || ""));
}

function tableNames(db) {
  const out = [];
  for (const stmt of db.iterateStatements(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )) {
    while (stmt.step()) out.push(stmt.get()[0]);
    stmt.free();
  }
  return out;
}

// Read back every user table so INSERT / UPDATE / DELETE / CREATE levels can be
// graded at all: those statements return no rows, so there is nothing to compare
// but the database they leave behind. Rows are sorted, since the physical order
// SQLite stores them in is not something a level should ever teach.
function dumpState(db) {
  const state = {};
  for (const name of tableNames(db)) {
    const rows = [];
    let cols = [];
    for (const stmt of db.iterateStatements(`SELECT * FROM "${name.replace(/"/g, '""')}"`)) {
      cols = stmt.getColumnNames();
      while (stmt.step() && rows.length < MAX_ROWS) rows.push(rowKey(stmt.get()));
      stmt.free();
    }
    rows.sort();
    state[name] = { cols, rows };
  }
  return state;
}

/**
 * Runs `setupSql` (trusted, from the track) and then `userSql` (the student's,
 * or the level's own answer) against a throwaway in-memory database.
 *
 * Never throws for anything the SQL did: a syntax error is a result to show,
 * not an exception to propagate. The returned `grid` is the LAST statement that
 * produced columns, which is what a database client would leave on screen.
 */
export function runScript(SQL, setupSql, userSql) {
  const db = new SQL.Database();
  let grid = null;
  let error = null;
  let truncated = false;
  try {
    if (setupSql && setupSql.trim()) db.run(setupSql);
    for (const stmt of db.iterateStatements(String(userSql || ""))) {
      const cols = stmt.getColumnNames();
      if (cols.length === 0) {
        // Not a query: stepping it once is what actually executes it.
        stmt.step();
        stmt.free();
        continue;
      }
      const rows = [];
      while (stmt.step()) {
        if (rows.length >= MAX_ROWS) { truncated = true; break; }
        rows.push(stmt.get());
      }
      stmt.free();
      grid = { cols, rows };
    }
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }
  let state = {};
  try {
    state = dumpState(db);
  } catch { /* a dropped or corrupt schema; the error above is the real story */ }
  try {
    db.close();
  } catch { /* already gone */ }
  return { grid, state, error, truncated };
}

function compareGrid(student, expected, { ordered, matchCols }) {
  const failures = [];
  if (student.cols.length !== expected.cols.length) {
    failures.push(
      `Your result has ${student.cols.length} column${student.cols.length === 1 ? "" : "s"}; ` +
        `the answer has ${expected.cols.length} (${expected.cols.join(", ")}).`
    );
    return failures;
  }
  if (matchCols) {
    const wrong = expected.cols.filter((name, i) => name !== student.cols[i]);
    if (wrong.length) {
      failures.push(`Your columns are named ${student.cols.join(", ")}; the answer names them ${expected.cols.join(", ")}.`);
      return failures;
    }
  }
  if (student.rows.length !== expected.rows.length) {
    failures.push(
      `Your query returned ${student.rows.length} row${student.rows.length === 1 ? "" : "s"}; ` +
        `the answer has ${expected.rows.length}.`
    );
    return failures;
  }

  const mine = student.rows.map(rowKey);
  const theirs = expected.rows.map(rowKey);
  if (ordered) {
    for (let i = 0; i < theirs.length; i++) {
      if (mine[i] !== theirs[i]) {
        failures.push(`Row ${i + 1} should be "${formatRow(expected.rows[i])}" but yours is "${formatRow(student.rows[i])}".`);
        return failures;
      }
    }
    return failures;
  }

  const sortedMine = [...mine].sort();
  const sortedTheirs = [...theirs].sort();
  for (let i = 0; i < sortedTheirs.length; i++) {
    if (sortedMine[i] !== sortedTheirs[i]) {
      const missing = expected.rows[theirs.indexOf(sortedTheirs[i])];
      failures.push(`Your rows are not the right ones — "${formatRow(missing)}" is missing.`);
      return failures;
    }
  }
  return failures;
}

function compareState(studentState, expectedState) {
  const failures = [];
  const expectedTables = Object.keys(expectedState);
  const studentTables = Object.keys(studentState);

  const missing = expectedTables.filter((t) => !studentTables.includes(t));
  if (missing.length) {
    failures.push(`The table ${missing.map((t) => `\`${t}\``).join(", ")} does not exist after your code runs.`);
    return failures;
  }

  for (const name of expectedTables) {
    const mine = studentState[name];
    const theirs = expectedState[name];
    // Names, not just the count. No SELECT can change them, so this only ever
    // bites on a CREATE TABLE level — where the names ARE what was asked for.
    if (mine.cols.join(",") !== theirs.cols.join(",")) {
      failures.push(`The table \`${name}\` should have the columns ${theirs.cols.join(", ")} — yours has ${mine.cols.join(", ") || "none"}.`);
      return failures;
    }
    if (mine.rows.length !== theirs.rows.length) {
      failures.push(`The table \`${name}\` should hold ${theirs.rows.length} row${theirs.rows.length === 1 ? "" : "s"} afterwards, but yours holds ${mine.rows.length}.`);
      return failures;
    }
    for (let i = 0; i < theirs.rows.length; i++) {
      if (mine.rows[i] !== theirs.rows[i]) {
        failures.push(`The rows in \`${name}\` are not right — check the values you wrote.`);
        return failures;
      }
    }
  }
  return failures;
}

/**
 * Grades a student's run against the level's own answer, run moments earlier
 * against an identical fresh database.
 *
 * Nothing here is hand-written: comparing against a real execution of the
 * level's `sol` is what makes a wrong expectation impossible to ship, the same
 * reason the Python tracks capture expected stdout by running the solution.
 */
export function gradeSql(student, expected, { ordered = false, matchCols = false } = {}) {
  if (student.error) {
    return { passed: false, failures: [`SQLite could not run that: ${student.error}`] };
  }

  const failures = [];

  if (expected.grid) {
    if (!student.grid) {
      failures.push("Your code did not produce a result table. This level wants a SELECT.");
    } else {
      failures.push(...compareGrid(student.grid, expected.grid, { ordered, matchCols }));
    }
  }

  // Checked even on SELECT levels, where it costs nothing and both sides are
  // trivially identical, so a level that changes data never needs to remember
  // to opt in.
  if (failures.length === 0) failures.push(...compareState(student.state, expected.state));

  return { passed: failures.length === 0, failures };
}
