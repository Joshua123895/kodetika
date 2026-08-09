// Running a level's Python from vitest without CPython.
//
// Every other Python suite shells out to `python`. That is the right default —
// it is a second, independent implementation, and a level that agrees in CPython
// and in the browser is a level that will not surprise anyone. But it makes the
// whole corpus unverifiable on a machine where the interpreter is missing or
// broken, which on Windows (where `python` is a Store alias that intermittently
// hangs) is not a hypothetical.
//
// Pyodide is the interpreter the deployed site actually uses, so running a level
// through it is not a downgrade — it is checking the thing students get. The npm
// package ships `python_stdlib.zip` but none of the unvendored wheels, so
// `sqlite3` is absent here while `hashlib`, `hmac` and `secrets` are present.
// Levels that need SQLite still require CPython, and `hasSqlite` says so rather
// than letting them fail as if they were wrong.

import { readFileSync } from "fs";
import { join } from "path";

let ready = null;

/** Boots one interpreter for the whole file and seeds the framework into it. */
export function getPyodide(libs = {}) {
  if (!ready) {
    ready = (async () => {
      const { loadPyodide } = await import("pyodide");
      // Pinned explicitly: pyodide finds its own .asm.js by resolving relative
      // to the caller, and under vite that lands on `node_modules/src/js/`.
      // Plain `node` happens to get it right, which makes this the kind of bug
      // that only appears in the suite.
      const py = await loadPyodide({ indexURL: join(process.cwd(), "node_modules/pyodide") });
      for (const [name, content] of Object.entries(libs)) py.FS.writeFile(name, content);
      py.runPython(`import sys\nsys.path.insert(0, "/home/pyodide")`);
      return py;
    })();
  }
  return ready;
}

/** The bytes the app ships, read the same way tests/miniweb.test.js reads them. */
export function miniwebFiles() {
  return { "miniweb.py": readFileSync(join(process.cwd(), "src/backend/miniweb.py"), "utf-8") };
}

/**
 * Runs `source` and returns what it printed.
 *
 * Each call gets its own globals dict, so one level cannot leave a name behind
 * for the next — the same isolation a fresh process gives the CPython suites.
 * `sys.modules` is cleared of the framework too, because a module is cached
 * across globals and a level that mutated it at import time would otherwise
 * poison every level after it.
 *
 * Never throws on student error: a traceback is a result to compare, exactly as
 * `execSync`'s stdout/stderr split is in the CPython suites.
 */
export async function runPyodide(source, libs = {}) {
  const py = await getPyodide(libs);
  let out = "";
  py.setStdout({ batched: (s) => { out += s + "\n"; } });
  py.setStderr({ batched: (s) => { out += s + "\n"; } });
  py.runPython(`import sys\nsys.modules.pop("miniweb", None)`);
  // `py.globals.get("dict")` is undefined — `dict` lives in builtins, not in the
  // main module's globals — and passing that through lands as a bare `undefined`
  // name inside the interpreter. `toPy({})` builds a real empty dict.
  const globals = py.toPy({});
  try {
    await py.runPythonAsync(source, { globals });
    return { stdout: out, error: null };
  } catch (err) {
    return { stdout: out, error: String(err.message || err) };
  } finally {
    globals.destroy();
  }
}

/** False under node: the wheel is not in the npm package. See the header. */
export async function hasSqlite() {
  const { stdout } = await runPyodide('try:\n    import sqlite3\n    print("yes")\nexcept ImportError:\n    print("no")');
  return stdout.trim() === "yes";
}
