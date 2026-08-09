// The single definition of "the Python program a level's solution actually is".
//
// This has to be one function because three places need the same answer and had
// been disagreeing:
//   - tests/levels.test.js, which verifies every solution against real CPython
//   - src/pages/LevelPage.jsx, when grading a level that has no `tests` by
//     diffing the student's output against the solution's
//   - the mini-game content generators, which need the exact source that
//     produces a level's recorded expected output
//
// Deliberately plain ESM: no import.meta.glob, no `?react` imports. src/data/
// tracks.js is Vite-only, so node scripts and vitest cannot import it — they can
// import this.

/**
 * Removes the common leading indentation from a block of code. YAML block
 * scalars carry the document's indentation into the string.
 */
export function dedent(str) {
  if (!str) return "";
  const lines = str.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^(\s*)/)[1].length);
  if (indents.length === 0) return "";
  const min = Math.min(...indents);
  return lines.map((l) => l.slice(min)).join("\n");
}

/**
 * Tracks whose solutions are written as a CONTINUATION of the starter code
 * rather than as a whole program. Keyed by track slug, never by file name or
 * array index: `track.id` is derived from the order Vite's glob happens to
 * return, which is not something to depend on.
 */
export const NEEDS_PRELUDE = new Set(["data-structures", "algorithms"]);

/**
 * The complete runnable program for a level's solution.
 *
 * Accepts either the parsed shape (`startingCode`/`solution`, from
 * src/data/tracks.js) or the raw YAML shape (`start`/`sol`), so callers that
 * read the YAML directly do not have to translate first.
 */
export function runnableSource(trackSlug, level) {
  const starter = level.startingCode ?? level.start ?? "";
  const solution = level.solution ?? level.sol ?? "";

  // The newline matters. Concatenating directly — as LevelPage used to — glues
  // the solution onto the starter's last line, e.g. "    ...from contextlib
  // import contextmanager", a SyntaxError.
  const base =
    NEEDS_PRELUDE.has(trackSlug) && starter.trim()
      ? dedent(starter + "\n" + solution)
      : dedent(solution);

  return withDriver(level, base);
}

/**
 * Merges a chapter's shared library into a level's seeded files.
 *
 * Backend chapters declare `lib: miniweb`, and the framework is delivered the
 * way file levels already deliver their files — written into the interpreter's
 * working directory, which is on sys.path. The browser worker, the dev server
 * and the CPython test harness all seed `files.initial` already, so one merge
 * here reaches all three with no runtime changes.
 *
 * Pure, and takes the file map as an argument rather than importing it: node
 * scripts import this module directly, and the registry that holds the bytes is
 * a Vite `?raw` import that only resolves inside a Vite pipeline.
 */
export function withLib(level, libFiles) {
  if (!libFiles) return level;
  const files = level.files ?? {};
  return {
    ...level,
    // The level's own seed wins, so a level can still override a lib file.
    files: { ...files, initial: { ...libFiles, ...(files.initial ?? {}) } },
  };
}

/**
 * Normalizes one `req:` entry. Accepts the shorthand string form `'GET /notes'`
 * (or a bare `'/notes'`, meaning GET) and the mapping form
 * `{ m, p, json, form, body, hdr }`.
 */
export function parseRequest(entry) {
  if (typeof entry === "string") {
    const parts = entry.trim().split(/\s+/);
    if (parts.length === 1) return { method: "GET", path: parts[0] };
    return { method: parts[0].toUpperCase(), path: parts.slice(1).join(" ") };
  }
  const req = {
    method: String(entry.m ?? entry.method ?? "GET").toUpperCase(),
    path: entry.p ?? entry.path ?? "/",
  };
  if (entry.json !== undefined) req.json = entry.json;
  if (entry.form !== undefined) req.form = entry.form;
  if (entry.body !== undefined) req.body = entry.body;
  if (entry.hdr !== undefined || entry.headers !== undefined) {
    req.headers = entry.hdr ?? entry.headers;
  }
  return req;
}

/**
 * The Python that drives a backend level and prints what came back.
 *
 * Handlers return responses; they do not print. Something has to make the
 * requests, and it must not be the student's own code: a level whose solution
 * printed its own results could be passed by printing the expected text and
 * never writing a route at all. Appending the driver makes that impossible —
 * a faked answer gets the fake lines AND the driver's real ones.
 *
 * Output is pinned, one request at a time:
 *
 *     GET /notes -> 200 OK
 *     [{"id": 1, "text": "buy milk"}]
 *
 * i.e. the request line, then any header named in `see:`, then the body when it
 * is not empty. A JSON body is re-dumped with sorted keys, so a student who
 * builds `{"text": t, "id": i}` is not failed against a solution that happened
 * to build it the other way round.
 */
export const PROBE_MARKER = "__SITC_PROBE__";

export function requestDriver(level, { probe = false } = {}) {
  if (!Array.isArray(level?.req) || level.req.length === 0) return "";

  const calls = level.req.map((entry) => {
    const req = parseRequest(entry);
    const kwargs = {};
    if (req.json !== undefined) kwargs.json = req.json;
    if (req.form !== undefined) kwargs.data = req.form;
    if (req.body !== undefined) kwargs.data = req.body;
    if (req.headers !== undefined) kwargs.headers = req.headers;
    return [req.method, req.path, kwargs];
  });

  const appName = level.app ?? "app";
  const see = level.see === undefined ? [] : Array.isArray(level.see) ? level.see : [level.see];

  // Emitted as JSON parsed at runtime rather than as Python literals: JSON's
  // string syntax is a subset of Python's, and json.loads gets true/false/null
  // right where a naive stringify would emit them as Python NameErrors.
  return [
    "",
    "# --- requests (added by the grader) ---",
    "import json as _mw_json",
    "from http import HTTPStatus as _mw_http",
    "",
    "_mw_seen = []",
    `_mw_app = globals().get(${JSON.stringify(appName)})`,
    "if _mw_app is None:",
    `    print("no application object named '${appName}' was defined")`,
    "else:",
    "    _mw_client = _mw_app.test_client()",
    `    for _mw_method, _mw_path, _mw_kwargs in _mw_json.loads(${pyString(JSON.stringify(calls))}):`,
    "        _mw_res = _mw_client.open(_mw_method, _mw_path, **_mw_kwargs)",
    "        try:",
    "            _mw_reason = _mw_http(_mw_res.status_code).phrase",
    "        except ValueError:",
    '            _mw_reason = ""',
    '        print(("%s %s -> %d %s" % (_mw_method, _mw_path, _mw_res.status_code, _mw_reason)).rstrip())',
    `        for _mw_name in _mw_json.loads(${pyString(JSON.stringify(see))}):`,
    "            if _mw_name in _mw_res.headers:",
    '                print(_mw_name + ": " + _mw_res.headers[_mw_name])',
    "        _mw_body = _mw_res.text",
    '        if _mw_body and _mw_res.headers.get("Content-Type", "").startswith("application/json"):',
    "            try:",
    "                _mw_body = _mw_json.dumps(_mw_json.loads(_mw_body), sort_keys=True)",
    "            except ValueError:",
    "                pass",
    "        if _mw_body:",
    "            print(_mw_body)",
    // The browser tab is fed the response the server really sent — `_mw_res.text`
    // rather than `_mw_body` — so what it renders is the student's own bytes and
    // not the sorted-keys rewrite that grading compares.
    "        _mw_seen.append({",
    '            "m": _mw_method, "p": _mw_path,',
    '            "s": _mw_res.status_code, "r": _mw_reason,',
    '            "h": dict(_mw_res.headers.items()), "b": _mw_res.text,',
    "        })",
    "",
    // Everything above prints exactly what grading compares. The probe block is
    // extra, appended only for the Run button, and the app splits it back off at
    // the marker — so the console still shows the graded transcript and nothing
    // more. Submit never composes this branch at all.
    ...(probe
      ? [
          `print(${pyString(PROBE_MARKER)})`,
          "print(_mw_json.dumps(_mw_seen))",
          "",
        ]
      : []),
    "# The worker keeps one interpreter alive across runs, so a correct app left",
    "# bound by an earlier run could answer for a later one that defined nothing.",
    "# Clearing it here rather than before the student's code keeps their line",
    "# numbers — and therefore their tracebacks — exactly as they wrote them.",
    `globals().pop(${JSON.stringify(appName)}, None)`,
    "",
  ].join("\n");
}

/** Appends the request driver to a program, when the level asks for one. */
export function withDriver(level, source, opts) {
  const driver = requestDriver(level, opts);
  if (!driver) return source;
  return `${String(source).replace(/\s+$/, "")}\n${driver}`;
}

/**
 * Splits a probe run's stdout into the part the console shows and the responses
 * the browser tab renders.
 *
 * Searches for the LAST marker, because a student can print the marker text
 * themselves; the driver's copy is always the final one. A run that crashed
 * before the driver has no marker at all, and then there is nothing to show.
 */
export function splitProbe(stdout) {
  const text = String(stdout ?? "");
  const at = text.lastIndexOf(PROBE_MARKER);
  if (at === -1) return { output: text, responses: null };
  // Sliced, not trimmed: everything before the marker is byte-for-byte the
  // stdout a non-probe run would have produced, and the console should show
  // exactly that.
  const head = text.slice(0, at);
  try {
    return { output: head, responses: JSON.parse(text.slice(at + PROBE_MARKER.length)) };
  } catch {
    return { output: head, responses: null };
  }
}

/** A Python string literal for `s`, safe to paste into generated source. */
function pyString(s) {
  return JSON.stringify(s);
}

/**
 * FNV-1a 32-bit hash, hex. Used by generated mini-game content to detect that
 * the level it was built from has since been edited, so a stale puzzle can be
 * dropped rather than pointing at the wrong line.
 */
export function srcHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
