// Who counts as an admin.
//
// Admin is not a privilege the server enforces — there is no server. It is a
// convenience for whoever is building the site: every chapter opens without
// having to play through the ones before it, and the account menu grows a
// button that erases progress for one track or all of them. Both are things a
// student could already do by editing localStorage; the point is not to stop
// them, it is to stop *authoring* a new track from meaning either grinding
// through four chapters or hand-seeding fake stars into a synced account.
//
// `VITE_ADMIN_EMAILS` is a comma-separated list. Note that Vite inlines every
// `VITE_` variable into the shipped bundle, so these addresses are readable by
// anyone who opens the JavaScript. That is acceptable precisely because admin
// unlocks nothing worth stealing — but do not extend this file into anything
// that gates real data. That belongs in a Supabase policy, not here.

const RAW = import.meta.env.VITE_ADMIN_EMAILS ?? "";

export const ADMIN_EMAILS = RAW.split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

/** Is this the address of an admin? Case-insensitive; false for no address. */
export function isAdminEmail(email) {
  if (!email || ADMIN_EMAILS.length === 0) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}
