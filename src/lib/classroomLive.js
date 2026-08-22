// Live updates for the classroom, on Supabase Realtime's postgres_changes.
//
// The approach is deliberately dumb: when any row in a watched table changes,
// the caller re-fetches what it was already showing. Applying deltas by hand
// would mean a second copy of every query's shape in here, and the fetches
// are small. RLS is applied per subscriber by Supabase, so this never hands
// anyone a row they could not have selected themselves. The tables are
// published by supabase/007_realtime.sql.

import { supabase } from "./supabase";

let seq = 0;

/**
 * Subscribes to every change on `tables` and calls `onChange(table, payload)`
 * for each, coalesced so a burst of writes becomes one callback. Returns the
 * unsubscribe, shaped for a useEffect cleanup. No client means no-op.
 *
 * `tables`: [{ table, filter? }] where filter is Realtime's single-column form,
 * e.g. "class_id=eq.<uuid>".
 */
export function watchTables(name, tables, onChange, { debounceMs = 150 } = {}) {
  if (!supabase || !tables.length) return () => {};

  let timer = null;
  let pending = null;
  const fire = (table, payload) => {
    pending = { table, payload };
    clearTimeout(timer);
    timer = setTimeout(() => {
      const p = pending;
      pending = null;
      if (p) onChange(p.table, p.payload);
    }, debounceMs);
  };

  // The suffix keeps two mounts of the same component (strict mode, or the
  // same class open in two tabs) from sharing, and so cancelling, a channel.
  let channel = supabase.channel(`${name}:${++seq}`);
  for (const t of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
      (payload) => fire(t.table, payload)
    );
  }
  channel.subscribe();

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
