# Kodetika

Browser-based coding education platform. Students write Python, HTML, CSS,
JavaScript or SQL in a CodeMirror editor, run it, and earn 1 to 3 stars for
correctness, code length and speed. Everything executes client side. There is
no server runtime and no `api/` directory: `vercel.json` is a static SPA
rewrite.

`notes/PRD.md` is the authority on how any subsystem works and why. Read the
relevant section before changing a runtime, a grader or a track. This file
covers only what you need in the first five minutes.

## Commands

```bash
npm run dev          # Vite dev server
npm test             # vitest run (full suite, ~4 minutes)
npm run lint         # eslint, must stay clean
npx vitest run tests/webLevels.test.js    # one suite while authoring
```

## Layout

| Path | What |
|------|------|
| `src/data/tracks/*.yaml` | All level content. The product lives here. |
| `src/data/tracks.js` | YAML parsing and normalization into the `TRACKS` array |
| `src/pages/LevelPage.jsx` | The level screen: Run, Submit, grading, stars |
| `src/editor/` | CodeMirror setup, file tabs |
| `src/visualizations/` | 22 components animating a student's real executed Python |
| `src/web/`, `src/sql/`, `src/backend/`, `src/game/` | The four non-Python runtimes |
| `tests/` | Vitest. Every track has a suite that runs its own solutions. |
| `notes/PRD.md` | Full product and architecture reference |

## Writing style

**No em-dashes.** Not in track descriptions, level text, or any prose written
for the product. Use a comma, a colon, or two sentences. The existing corpus
still has them in places, so match this rule rather than the surrounding text
when you touch a line.

Track descriptions follow the Python Fundamentals shape: one short sentence,
usually a verb phrase then a colon then a concrete list.

```yaml
desc: 'Master Python from the ground up: variables, loops, functions, and more.'
```

Level names are noun phrases ("Collision Geometry"), not imperatives. `obj:` is
the task, `expl:` is the concept, and they are never merged.

## Level authoring invariants

These are the rules that fail loudly in CI, or worse, silently ship a broken
level. Each is enforced by a test.

1. **Never hand-write expected output.** Capture it by running a solution.
   CPython is the authority for Python tracks, a real DOM for web tracks, real
   SQLite for SQL.
2. **The starter must fail and the solution must pass.** A starter that already
   satisfies its own checks hands out three stars for pressing Submit.
3. **Every line budget must be reachable by the level's own solution**, or the
   second star is unearnable. `node scripts/star-budgets.mjs --fix` repairs.
4. **Web levels may assert only on gradable style properties.** jsdom has no
   layout engine, so `width: 50%`, `margin: 0 auto`, `border-width` and the
   shorthands compute differently there than in Chrome. `isGradableStyle`
   rejects them and the suite fails the build.
5. **Web and SQL `checks:` are regex-only.** The AST forms (`cls`, `fn`, `mth`,
   `inh`, `not`) parse the source with Python's `ast` and would drag a 20MB
   Pyodide download into a track that never touches it.
6. **SQL `checks:` patterns need `(?i)`.** SQL is case-insensitive, so a
   pattern accepting only `GROUP BY` rejects the identical query in lower case.
7. **Chapter and track icons resolve by filename.** `icon: foo` needs
   `src/assets/icons/chapter/foo.svg`. Reuse an existing name; a new chapter
   with an unmatched icon fails `tests/icons.test.js`.
8. **Inserting a chapter mid-track requires explicit `id:` on its levels.** A
   level's id is its identity, not its position: progress and drafts are stored
   as `{trackSlug: {levelId: stars}}`, so renumbering moves a student's stars
   onto different levels. `assignLevelIds` in `src/data/levelSource.js` honours
   a declared `id:` and numbers the rest from the lowest free one. Give new
   levels ids above the track's previous maximum and leave existing ones alone.
   That function is the single definition; `tracks.js`, `BugHuntPage.jsx`, the
   generators and the test suites all call it rather than counting positions.
9. **No backtick inside the injected script templates** in
   `src/web/webRuntime.js` and `src/backend/fetchShim.js`. Both are template
   literals, one backtick ends them early, and the halves either side stay
   valid JavaScript, so every level silently times out. This has shipped twice.
   `tests/webRuntime.test.js` guards it.

## Line endings

`.gitattributes` pins everything to LF. Do not reintroduce CRLF: several tests
match on exact byte sequences and a CRLF checkout fails them in ways that read
like unrelated bugs.

## Known pre-existing test failures

One case in `tests/icons.test.js` ("has no unused icon files") fails on a clean
checkout: `src/assets/icons/track/web.svg` is not referenced by any track.
Confirm any failure you see is not that one before chasing it, by stashing and
rerunning.

The 78 `tests/backendLevels.test.js` failures that used to sit alongside it are
fixed. They were the suite's fault, not the content's: it graded Web Developer
levels against a stdout contract that full-stack levels are not written to
satisfy. See PRD section 8.

## Skills

`.claude/skills/graphify/` generates architecture and dependency diagrams of
this codebase as Mermaid in an Artifact. It is a developer tool, unrelated to
the student-facing `viz:` visualizations.
