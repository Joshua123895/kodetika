// Carries data across the rename from "Step Into Code" to Kodetika.
//
// Every localStorage key the app owns was prefixed `step-into-code_`. Renaming
// them to `kodetika_` without this would silently empty the site for anyone who
// had used it before: stars gone, saved drafts gone, arcade high scores gone —
// and for a signed-out student there is no cloud copy to restore from.
//
// Called at module scope beside each key it renames, rather than once in
// main.jsx, so a module that reads its key on import cannot run before its own
// migration has.

/**
 * Copies whatever the pre-rename key held to its Kodetika key, once.
 *
 * The old key is deliberately LEFT IN PLACE. It costs a few kilobytes and it
 * means a student who opens an older deployment — a stale tab, a preview URL —
 * still finds their work there. It also makes this safe to run twice: the copy
 * only happens when the new key is genuinely absent, so a later write under the
 * new name is never overwritten by the stale old one.
 */
export function adoptLegacyKey(newKey, oldKey) {
  try {
    if (localStorage.getItem(newKey) !== null) return;
    const carried = localStorage.getItem(oldKey);
    if (carried !== null) localStorage.setItem(newKey, carried);
  } catch {
    // Private mode, a disabled-storage browser, or an opaque origin (the web
    // track's sandboxed iframe). Losing the migration is not worth losing the app.
  }
}
