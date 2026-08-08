import { load } from "js-yaml";
import { parseRichText } from "./richText";

const trackModules = import.meta.glob("./tracks/*.yaml", { query: "?raw", import: "default", eager: true });

// Icons are discovered from the filesystem, never registered by hand: drop an
// SVG into assets/icons/track/ or assets/icons/chapter/ and it is immediately
// available under its own FILENAME. `icon: linked_list` in a YAML resolves to
// linked_list.svg. Renaming the file renames the icon; there is no second list
// to keep in sync.
const trackIconModules = import.meta.glob("../assets/icons/track/*.svg", {
  query: "?react",
  import: "default",
  eager: true,
});
const chapterIconModules = import.meta.glob("../assets/icons/chapter/*.svg", {
  query: "?react",
  import: "default",
  eager: true,
});

function byFilename(modules) {
  const map = {};
  for (const [path, component] of Object.entries(modules)) {
    map[path.split("/").pop().replace(/\.svg$/, "")] = component;
  }
  return map;
}

const TRACK_ICONS = byFilename(trackIconModules);
const CHAPTER_ICONS = byFilename(chapterIconModules);

export const ICON_NAMES = { track: Object.keys(TRACK_ICONS), chapter: Object.keys(CHAPTER_ICONS) };

// An icon must exist as a file in its OWN scope folder. There is no placeholder
// and no cross-scope fallback: a missing icon is a hard error, so a broken icon
// set fails loudly at load instead of shipping letter badges that look like a
// design choice. Misses are collected rather than thrown one at a time (see
// below) so one run reports every missing file, not just the first.
const iconMisses = [];

function resolveIcon(name, scope, owner) {
  const table = scope === "track" ? TRACK_ICONS : CHAPTER_ICONS;
  const found = table[name];
  if (!found) iconMisses.push(`  ${owner} -> src/assets/icons/${scope}/${name}.svg`);
  return found;
}

// Lives in its own module so it can be unit tested: importing tracks.js from
// node pulls in import.meta.glob and ?react SVG imports that only Vite resolves.

function parseTests(tests) {
  if (!tests || tests.length === 0) return undefined;
  return tests.map((t) => {
    if (typeof t === "string") {
      return { expected: t };
    }
    const out = {};
    if (t.in !== undefined) out.input = t.in;
    if (t.exp !== undefined) out.expected = t.exp;
    if (t.any !== undefined) out.expectAnyOf = t.any;
    if (t.match !== undefined) out.expectMatch = t.match;
    return out;
  });
}

function parseExample(ex) {
  if (!ex) return undefined;
  return { input: ex.in ?? ex.input, output: ex.out ?? ex.output };
}

function parseChecks(checks) {
  if (!checks) return undefined;
  const c = {};
  if (checks.cls) c.classes = checks.cls;
  if (checks.fn) c.functions = checks.fn;
  if (checks.mth) c.methods = checks.mth;
  if (checks.inh) c.inheritance = checks.inh;
  if (checks.not) c.not = checks.not;
  if (checks.classes) c.classes = checks.classes;
  if (checks.functions) c.functions = checks.functions;
  if (checks.methods) c.methods = checks.methods;
  if (checks.inheritance) c.inheritance = checks.inheritance;
  // Normalize every parent list to an array, the same way `has`/`no` are below,
  // so the validator never has to guess whether it holds a string or a list.
  if (c.inheritance) {
    c.inheritance = Object.fromEntries(
      Object.entries(c.inheritance).map(([child, parents]) => [child, Array.isArray(parents) ? parents : [parents]])
    );
  }
  // Code-pattern checks (game goals): `has` = must contain, `no` = must not,
  // `msg` = friendly message shown on failure.
  if (checks.has) c.contains = Array.isArray(checks.has) ? checks.has : [checks.has];
  if (checks.no) c.absent = Array.isArray(checks.no) ? checks.no : [checks.no];
  if (checks.contains) c.contains = Array.isArray(checks.contains) ? checks.contains : [checks.contains];
  if (checks.absent) c.absent = Array.isArray(checks.absent) ? checks.absent : [checks.absent];
  if (checks.msg) c.failMessage = checks.msg;
  return c;
}

function parseFiles(files) {
  if (!files) return undefined;
  const f = {};
  if (files.initial) f.initial = files.initial;
  if (files.track) f.track = files.track;
  return f;
}

function parseMax(max) {
  if (!max) return {};
  const parts = String(max).split("/");
  return {
    maxLines: parts[0] ? parseInt(parts[0], 10) : undefined,
    maxTime: parts[1] ? parseInt(parts[1], 10) : undefined,
  };
}

function parseLevel(lvl) {
  const { max, obj, expl, start, sol, checks, ...rest } = lvl;
  const result = { ...rest };
  if (obj) result.objective = parseRichText(obj);
  if (lvl.hint) result.hint = parseRichText(lvl.hint);
  if (expl) result.explanation = parseRichText(expl);
  if (start) result.startingCode = start;
  if (sol) result.solution = sol;
  if (lvl.tests) result.tests = parseTests(lvl.tests);
  if (lvl.example) result.example = parseExample(lvl.example);
  if (checks) result.sourceChecks = parseChecks(checks);
  if (lvl.files) result.files = parseFiles(lvl.files);
  if (max) {
    const { maxLines, maxTime } = parseMax(max);
    if (maxLines !== undefined) result.maxLines = maxLines;
    if (maxTime !== undefined) result.maxTime = maxTime;
  }
  return result;
}

const rawData = Object.values(trackModules).map((yaml) => load(yaml));

const TRACKS = rawData.map((track) => ({
  name: track.name,
  slug: track.slug,
  trackIcon: resolveIcon(track.icon, "track", `track "${track.name}"`),
  description: track.desc,
  difficulty: track.difficulty,
  // SQL tracks only: the script that builds the little database every level in
  // the track queries. It lives on the track rather than on each level so the
  // student learns ONE schema and keeps it, instead of re-reading a new set of
  // table names thirty times.
  db: track.db,
  chapters: track.chapters.map((ch) => ({
    name: ch.name,
    chapterIcon: resolveIcon(ch.icon, "chapter", `${track.name} / ${ch.name}`),
    levels: ch.levels.map(parseLevel),
  })),
}));

// Every track and chapter has now been resolved, so this reports the complete
// set of missing files in one message instead of dying on the first one.
if (iconMisses.length > 0) {
  throw new Error(
    `${iconMisses.length} icon(s) referenced by a YAML have no SVG file.\n` +
      `Icons resolve by filename, so each name below needs a file at exactly that path:\n\n` +
      iconMisses.join("\n") +
      `\n\nAvailable in track/: ${Object.keys(TRACK_ICONS).join(", ") || "(none)"}` +
      `\nAvailable in chapter/: ${Object.keys(CHAPTER_ICONS).join(", ") || "(none)"}`
  );
}

TRACKS.forEach((track) => {
  track.id = TRACKS.indexOf(track) + 1;
  track.chapters.forEach((chapter, ci) => {
    chapter.id = ci + 1;
  });
  let levelId = 1;
  track.chapters.forEach((chapter) => {
    chapter.levels.forEach((level) => {
      level.id = levelId++;
    });
  });
});

const DIFFICULTY = {
  1: { label: "Beginner", bg: "#6AAE6F20", color: "#6AAE6F" },
  2: { label: "Intermediate", bg: "#7AA2F720", color: "#7AA2F7" },
  3: { label: "Advanced", bg: "#BB9AF720", color: "#BB9AF7" },
  4: { label: "Expert", bg: "#FF5F5720", color: "#FF5F57" },
};

export { TRACKS, DIFFICULTY };
