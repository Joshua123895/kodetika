// Main-thread RPC wrapper around sqlWorker.js, modelled on pyodideWorkerClient.
// Smaller in every way: SQLite is ~1.2MB rather than ~20MB, boots in
// milliseconds, and needs no filesystem seeding.
//
// The timeout matters for the same reason it does there. A query that never
// returns is stuck inside Wasm, so only terminate() can actually stop it; a
// Promise.race on its own would leave the worker spinning a core forever.

export const SQL_TIMEOUT_MS = 5000;

let worker = null;
let nextId = 1;
let warmPromise = null;
const pending = new Map();

function discardWorker(w) {
  if (worker === w) {
    worker = null;
    // A fresh worker has no engine loaded, so a resolved promise from the dead
    // one would wrongly report the new one as ready.
    warmPromise = null;
  }
}

function spawnWorker() {
  const w = new Worker(new URL("./sqlWorker.js", import.meta.url), { type: "module" });
  w.onmessage = (e) => {
    const { id, fatalError, ...rest } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (fatalError) entry.reject(new Error(fatalError));
    else entry.resolve(rest);
  };
  w.onerror = (e) => {
    for (const entry of pending.values()) entry.reject(new Error(e.message || "sql worker error"));
    pending.clear();
    discardWorker(w);
  };
  worker = w;
  return w;
}

/** Downloads and boots SQLite ahead of the first query. Safe to call repeatedly. */
export function warmSqlWorker() {
  if (warmPromise) return warmPromise;
  const w = worker || spawnWorker();
  const id = nextId++;
  warmPromise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, warmup: true });
  }).catch((err) => {
    if (warmPromise && worker === w) warmPromise = null;
    throw err;
  });
  return warmPromise;
}

/**
 * Runs `code` against a fresh database seeded with `setup`, and — when a
 * `reference` answer is given — runs that too, against a second identical
 * database, so the caller can compare the two.
 *
 * Resolves with `{ student, expected }`. Rejects only when the harness itself
 * fails: SQL errors travel back inside `student.error`, because a syntax error
 * is something to show the student, not an exception.
 */
export async function runSql(setup, code, reference) {
  // Wait for the engine BEFORE arming the timeout. Billing a slow first download
  // to the student's query would report a perfectly good SELECT as a hang, and
  // the terminate() that followed would throw away the half-loaded engine.
  await warmSqlWorker();

  const w = worker || spawnWorker();
  const id = nextId++;

  const resultPromise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  w.postMessage({ id, setup, code, reference });

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      pending.delete(id);
      w.terminate();
      discardWorker(w);
      reject(new Error("TIMEOUT"));
    }, SQL_TIMEOUT_MS);
  });

  try {
    return await Promise.race([resultPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
