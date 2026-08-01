// Main-thread RPC wrapper around pyodideWorker.js. A timeout here isn't a
// vague "give up and hope", calling worker.terminate() on a genuinely stuck
// worker actually kills the OS-level thread running the infinite loop,
// which a Promise.race timeout alone could never do (the main thread would
// just be waiting on a message that's never coming because the worker's own
// event loop is wedged inside synchronous Wasm execution).
export const EXECUTION_TIMEOUT_MS = 8000;
export const TIMEOUT_MESSAGE = "⏱ Execution stopped: possible infinite loop (exceeded 8s)";

let worker = null;
let nextId = 1;
let warmPromise = null;
const pending = new Map();

// Called whenever the current worker stops being usable. The warm-up promise
// must be dropped alongside it: a fresh worker starts with no Pyodide at all, so
// a resolved promise from the dead one would wrongly report the new one as warm.
function discardWorker(w) {
  if (worker === w) {
    worker = null;
    warmPromise = null;
  }
}

function spawnWorker() {
  const w = new Worker(new URL("./pyodideWorker.js", import.meta.url), { type: "module" });
  w.onmessage = (e) => {
    const { id, fatalError, ...rest } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (fatalError) entry.reject(new Error(fatalError));
    else entry.resolve(rest);
  };
  w.onerror = (e) => {
    for (const entry of pending.values()) entry.reject(new Error(e.message || "pyodide worker error"));
    pending.clear();
    discardWorker(w);
  };
  worker = w;
  return w;
}

/**
 * Boots Pyodide in the worker ahead of time. Safe to call repeatedly — the
 * in-flight promise is shared. Deliberately has NO timeout: this is a download,
 * not student code, and killing it would only force a slower retry.
 */
export function warmPyodideWorker() {
  if (warmPromise) return warmPromise;
  const w = worker || spawnWorker();
  const id = nextId++;
  warmPromise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, warmup: true });
  }).catch((err) => {
    // Let a later attempt retry instead of caching the failure forever.
    if (warmPromise && worker === w) warmPromise = null;
    throw err;
  });
  return warmPromise;
}

export async function runInPyodideWorker(code, { initialFiles = {}, trackedFiles = [], inputs = [], needsIOShim = false } = {}) {
  // Wait for the interpreter to exist BEFORE arming the timeout below. The timer
  // used to start at postMessage, so a slow first load was reported to the
  // student as "possible infinite loop" for perfectly correct code — and the
  // terminate() that followed threw away the half-loaded runtime, forcing the
  // next attempt to download all ~20MB again.
  await warmPyodideWorker();

  const w = worker || spawnWorker();
  const id = nextId++;

  const resultPromise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  w.postMessage({ id, code, initialFiles, trackedFiles, inputs, needsIOShim });

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      pending.delete(id);
      w.terminate();
      discardWorker(w);
      reject(new Error("TIMEOUT"));
    }, EXECUTION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([resultPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
