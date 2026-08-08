// SQLite (compiled to WebAssembly) in a Web Worker.
//
// The worker is not about speed — the databases here hold a few dozen rows and
// every query is instant. It is about being able to stop. `WITH RECURSIVE` with
// no stopping condition, or an aggregate over one, spends forever inside a
// single uninterruptible sqlite3_step, and no amount of JS timeout can reach
// into that. Off the main thread, the client can terminate() the whole worker
// and the tab survives — the same reasoning that put Pyodide in a worker.
import initSqlJs from "sql.js";
// Vite fingerprints and serves the .wasm from our own origin. Deliberately not a
// CDN: the runtime a student needs in order to submit anything at all should not
// depend on a third party being up.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { runScript } from "./sqlCore";

let sqlPromise = null;

function ensureSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  }
  return sqlPromise;
}

self.onmessage = async (e) => {
  const { id, setup, code, reference, warmup } = e.data;

  if (warmup) {
    try {
      await ensureSql();
      self.postMessage({ id, ready: true });
    } catch (err) {
      self.postMessage({ id, fatalError: String(err) });
    }
    return;
  }

  try {
    const SQL = await ensureSql();
    // Two separate databases, both seeded from the same script. Sharing one
    // would let the reference answer be graded against whatever the student's
    // UPDATE had already done to it.
    const student = runScript(SQL, setup, code);
    const expected = reference === undefined || reference === null ? null : runScript(SQL, setup, reference);
    self.postMessage({ id, student, expected });
  } catch (err) {
    self.postMessage({ id, fatalError: String(err) });
  }
};
