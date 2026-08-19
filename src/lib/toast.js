// A one-way channel from anywhere to the toast stack.
//
// Deliberately a module-level emitter rather than another React context. The
// thing that most wants to raise a toast is ProgressContext.completeLevel, and
// a context can only consume a provider that wraps it, which would pin the
// stack above the router and make the ordering in main.jsx load-bearing for a
// notification. This is the same shape as registerCloudSaver in savedCode.js:
// plain module, subscribe from the component that renders.

let listeners = new Set();
let nextId = 1;

/**
 * Shows a toast.
 *
 * `progress: { from, to, max }` animates a bar from one value to another, which
 * is the whole point of showing this on a level completion: the interesting
 * part is not where you are, it is that you just moved.
 */
export function emitToast(toast) {
  const full = { id: nextId++, ttl: 4500, ...toast };
  for (const fn of listeners) fn(full);
  return full.id;
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
