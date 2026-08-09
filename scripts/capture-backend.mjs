// Authoring tool for the backend tracks (gitignored).
//
// House rule: expected output is captured from a real run, never typed. Write a
// level with `exp: __CAPTURE__`, then:
//
//     node scripts/capture-backend.mjs src/data/tracks/python8.yaml        # report
//     node scripts/capture-backend.mjs src/data/tracks/python8.yaml --fix  # fill in
//
// --fix rewrites each placeholder into a block scalar holding exactly what the
// level's own solution printed, seeded and driven the same way the app does it.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load } from "js-yaml";
import { runnableSource, withLib } from "../src/data/levelSource.js";

const PLACEHOLDER = "__CAPTURE__";
const file = process.argv[2];
const fix = process.argv.includes("--fix");
if (!file) {
  console.error("usage: node scripts/capture-backend.mjs <track.yaml> [--fix]");
  process.exit(1);
}

// The framework is a plain file on disk; read it directly rather than through
// the Vite-only `?raw` registry, which does not resolve under bare node.
const LIBS = {
  miniweb: { "miniweb.py": readFileSync("src/backend/miniweb.py", "utf-8") },
};

let python = "python";
for (const cmd of ["python", "python3", "py"]) {
  try {
    execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
    python = cmd;
    break;
  } catch {
    // try the next candidate
  }
}

function run(level, lib) {
  const seeded = withLib(level, LIBS[lib]);
  const dir = mkdtempSync(join(tmpdir(), "sitc-capture-"));
  try {
    for (const [name, content] of Object.entries(seeded.files?.initial ?? {})) {
      writeFileSync(join(dir, name), String(content), "utf-8");
    }
    writeFileSync(join(dir, "main.py"), runnableSource("__capture__", level), "utf-8");
    try {
      return {
        out: execSync(`${python} main.py`, {
          cwd: dir,
          timeout: 15000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }),
        err: "",
      };
    } catch (e) {
      return { out: e.stdout || "", err: e.stderr || "(crashed)" };
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // cleanup failures are never worth failing over
    }
  }
}

const source = readFileSync(file, "utf-8");
const track = load(source);

const pending = [];
for (const chapter of track.chapters ?? []) {
  for (const level of chapter.levels ?? []) {
    const tests = Array.isArray(level.tests) ? level.tests : [];
    const needs = tests.some((t) => t && typeof t === "object" && t.exp === PLACEHOLDER);
    if (needs) pending.push({ level, lib: chapter.lib, chapter: chapter.name });
  }
}

if (pending.length === 0) {
  console.log("nothing to capture — no `exp: __CAPTURE__` left in " + file);
  process.exit(0);
}

const captured = [];
let failures = 0;
for (const entry of pending) {
  const { out, err } = run(entry.level, entry.lib);
  const clean = out.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  if (err || !clean) {
    failures++;
    console.log(`\n### ${entry.chapter} / ${entry.level.name}  [PROBLEM]`);
    console.log(err ? `stderr: ${err.trim()}` : "printed nothing at all");
    if (clean) console.log(clean);
  } else {
    console.log(`\n### ${entry.chapter} / ${entry.level.name}`);
    console.log(clean);
  }
  captured.push(clean);
}

console.log(`\n${pending.length} level(s) captured, ${failures} problem(s).`);

if (!fix) {
  console.log("re-run with --fix to write these into the YAML.");
  process.exit(failures ? 1 : 0);
}
if (failures) {
  console.error("refusing to write: fix the problems above first.");
  process.exit(1);
}

// Placeholders are replaced in document order, which is the order the levels
// were collected in above.
let index = 0;
const rewritten = source
  .split("\n")
  .flatMap((line) => {
    const at = line.indexOf(`exp: ${PLACEHOLDER}`);
    if (at === -1) return [line];
    const body = captured[index++];
    const indent = " ".repeat(at + 2);
    return [line.slice(0, at) + "exp: |", ...body.split("\n").map((l) => (l ? indent + l : ""))];
  })
  .join("\n");

writeFileSync(file, rewritten, "utf-8");
console.log(`wrote ${index} expected output(s) into ${file}`);
