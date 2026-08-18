import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load } from "js-yaml";
import { checkOutput, norm } from "../src/utils/outputMatcher.js";
import { runnableSource, dedent, parseRequest, withLib, withDriver, splitProbe } from "../src/data/levelSource.js";
import { BACKEND_LIBS } from "../src/backend/miniwebSource.js";
import { isFullstackLevel } from "../src/backend/fullstack.js";
import { compilePattern } from "../src/utils/structureValidator.js";

// The backend tracks are ordinary Python graded by ordinary stdout comparison,
// with two additions: chapters declare `lib: miniweb` to seed a framework, and
// levels declare `req:` so a driver appended after the student's routes makes
// the requests and prints the responses. This suite reproduces both exactly as
// src/data/tracks.js and src/pages/LevelPage.jsx do, then runs every level
// against real CPython.
//
// It exists instead of a describe block in tests/levels.test.js because that
// harness seeds only the raw YAML's `files.initial` — which never contains the
// framework, since the framework is merged in at parse time — and knows nothing
// about the driver.

const TRACK_DIR = join(process.cwd(), "src/data/tracks");

// Discovered by content, not by filename: a chapter with `lib:` or a level with
// `req:` is what the app branches on, so the tests split the corpus the same way.
const tracks = [];
for (const file of readdirSync(TRACK_DIR).filter((f) => f.endsWith(".yaml")).sort()) {
  const track = load(readFileSync(join(TRACK_DIR, file), "utf8"));
  const levels = [];
  let backend = false;
  for (const chapter of track.chapters ?? []) {
    if (chapter.lib) backend = true;
    for (const level of chapter.levels ?? []) {
      if (level.req) backend = true;
      levels.push({ chapter: chapter.name, lib: chapter.lib, level });
    }
  }
  if (backend) tracks.push({ file, track, levels });
}

let pythonCmd = null;
beforeAll(() => {
  for (const cmd of ["python", "python3", "py"]) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
      pythonCmd = cmd;
      return;
    } catch {
      // Not this interpreter — try the next candidate.
    }
  }
  throw new Error("Python not found. Install Python to run backend level tests.");
});

/** Runs `source` in a temp dir seeded exactly the way the app seeds the level. */
function run(entry, source) {
  const seeded = withLib(entry.level, BACKEND_LIBS[entry.lib]);
  const dir = mkdtempSync(join(tmpdir(), "sitc-backend-"));
  try {
    for (const [name, content] of Object.entries(seeded.files?.initial ?? {})) {
      writeFileSync(join(dir, name), String(content), "utf-8");
    }
    writeFileSync(join(dir, "main.py"), source, "utf-8");
    try {
      const stdout = execSync(`${pythonCmd} main.py`, {
        cwd: dir,
        timeout: 15000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, stderr: "", crashed: false };
    } catch (e) {
      return { stdout: e.stdout || "", stderr: e.stderr || "", crashed: true };
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A leftover temp dir is harmless; never fail a test over cleanup.
    }
  }
}

/** The program the level's own solution is, driver included. */
const solutionSource = (track, entry) => runnableSource(track.slug, entry.level);

/** The program a student's `source` becomes when submitted. */
const submittedSource = (entry, source) =>
  runnableSource("__student__", { ...entry.level, sol: dedent(source ?? "") });

const countLines = (s) =>
  s.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).length;

describe("backend tracks", () => {
  it("found the backend tracks", () => {
    expect(tracks.length).toBeGreaterThan(0);
  });

  for (const { file, track, levels } of tracks) {
    describe(`${file} (${track.name})`, () => {
      it("declares the fields a track needs", () => {
        expect(track.slug).toBeTruthy();
        expect(track.icon).toBeTruthy();
        expect(track.desc).toBeTruthy();
        expect(track.difficulty).toBeGreaterThanOrEqual(1);
        expect(track.difficulty).toBeLessThanOrEqual(4);
      });

      for (const entry of levels) {
        const { level, chapter } = entry;
        const label = `${chapter} / ${level.name}`;

        // A full-stack level is a backend level whose verdict comes from a DOM
        // (PRD 3.6e), so its answer is an `expect:` block and it is under no
        // obligation to carry `tests:` at all. The three checks below that
        // compare stdout therefore do not apply to it, and
        // tests/fullstackLevels.test.js makes the equivalent assertions against
        // the rendered page instead. Everything else in this suite — the line
        // budget, the source checks, the shape of `req:`, the `app:` object,
        // the `example:` block — is about the level rather than its stdout, and
        // still runs. Split on the level, not the filename, the same way
        // tests/webLevels.test.js steps around `sql:` levels and LevelPage
        // takes the full-stack branch before the backend one.
        const gradedByPage = isFullstackLevel(level);

        it.skipIf(gradedByPage)(`${label}: the solution produces its expected output`, () => {
          const result = run(entry, solutionSource(track, entry));
          expect(Array.isArray(level.tests) && level.tests.length > 0).toBe(true);
          // stderr must stay empty: the suite compares stdout while the browser
          // merges stdout and stderr, so anything here passes CI and fails the
          // student. miniweb logs a crashing handler to stdout for this reason.
          expect(result.stderr).toBe("");
          expect(result.crashed).toBe(false);
          for (const test of level.tests) {
            const normalized =
              typeof test === "string"
                ? { expected: test }
                : { expected: test.exp, expectAnyOf: test.any, expectMatch: test.match };
            expect(checkOutput(result.stdout, normalized)).toBe(true);
          }
        });

        it.skipIf(gradedByPage)(`${label}: the starter does not already pass`, () => {
          const starter = dedent(level.start ?? "");
          if (!starter.trim()) return; // An empty editor cannot print anything.
          // Submitting runs the source checks as well as the output comparison
          // (LevelPage.jsx:400), so a level whose whole point is *how* the answer
          // is computed — `compare_digest` rather than `==` — is legitimately
          // gated by `checks` alone, and the starter fails there instead.
          const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
          const checksPass =
            asList(level.checks?.has).every((p) => compilePattern(p).test(starter)) &&
            asList(level.checks?.no).every((p) => !compilePattern(p).test(starter));
          if (!checksPass) return;
          const result = run(entry, submittedSource(entry, starter));
          const passes = level.tests.every((test) => {
            const normalized =
              typeof test === "string"
                ? { expected: test }
                : { expected: test.exp, expectAnyOf: test.any, expectMatch: test.match };
            return checkOutput(result.stdout, normalized);
          });
          expect(passes).toBe(false);
        });

        it(`${label}: the line budget is reachable`, () => {
          // Stars are measured on what the student types, which is the solution
          // as written — never the driver, and never the seeded framework.
          expect(level.max).toBeTruthy();
          const budget = parseInt(String(level.max).split("/")[0], 10);
          expect(countLines(dedent(level.sol ?? ""))).toBeLessThanOrEqual(budget);
        });

        it(`${label}: its source checks match its own solution`, () => {
          if (!level.checks) return;
          const sol = dedent(level.sol ?? "");
          const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
          for (const pattern of asList(level.checks.has)) {
            expect(compilePattern(pattern).test(sol)).toBe(true);
          }
          for (const pattern of asList(level.checks.no)) {
            expect(compilePattern(pattern).test(sol)).toBe(false);
          }
        });

        if (level.req) {
          // The Run button composes a THIRD program: the graded one plus a probe
          // block whose JSON feeds the `browser` tab. Grading must never see it,
          // so the contract is that everything before the marker is byte-for-byte
          // what the graded program printed. If that ever drifts, a student's
          // console would stop agreeing with their result.
          it.skipIf(gradedByPage)(`${label}: a probe run prints the graded transcript unchanged`, () => {
            const base = dedent(level.sol ?? "");
            const probed = run(entry, withDriver(level, base, { probe: true }));
            expect(probed.stderr).toBe("");
            const { output, responses } = splitProbe(probed.stdout);

            // A level graded by `match:` is one whose output is deliberately not
            // fixed — a token that came out the same every run would not be a
            // secret — so two runs cannot be compared byte for byte. There the
            // contract is checked the way grading itself checks it.
            const fixed = level.tests.every((t) => typeof t === "string" || t.match === undefined);
            if (fixed) {
              expect(output).toBe(run(entry, withDriver(level, base)).stdout);
            } else {
              for (const test of level.tests) {
                expect(checkOutput(output, { expected: test.exp, expectAnyOf: test.any, expectMatch: test.match })).toBe(true);
              }
            }

            // And the payload really describes every request the level makes.
            expect(Array.isArray(responses)).toBe(true);
            expect(responses).toHaveLength(level.req.length);
            responses.forEach((res, i) => {
              const req = parseRequest(level.req[i]);
              expect(res.m).toBe(req.method);
              expect(res.p).toBe(req.path);
              expect(typeof res.s).toBe("number");
              expect(typeof res.b).toBe("string");
              // Every response carries a content type, which is what the tab
              // uses to decide between rendering a page and printing JSON.
              expect(Object.keys(res.h).map((k) => k.toLowerCase())).toContain("content-type");
            });
          });

          it(`${label}: its requests are well formed`, () => {
            const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
            expect(level.req.length).toBeLessThanOrEqual(8); // 8s worker timeout
            for (const raw of level.req) {
              const req = parseRequest(raw);
              expect(methods.has(req.method)).toBe(true);
              expect(req.path.startsWith("/")).toBe(true);
            }
          });

          it(`${label}: the app object it grades is the one the solution builds`, () => {
            // A typo here would grade a stale or absent object rather than the
            // student's work, and the level would look mysteriously unsolvable.
            const appName = level.app ?? "app";
            expect(dedent(level.sol ?? "")).toMatch(
              new RegExp(`^\\s*${appName}\\s*=`, "m"),
            );
          });
        }

        if (level.example) {
          it(`${label}: its example output is what really happens`, () => {
            const result = run(entry, solutionSource(track, entry));
            expect(norm(result.stdout)).toBe(norm(String(level.example.out ?? "")));
          });
        }
      }
    });
  }
});
