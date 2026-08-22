// What to call a signed-in account and what face to show for it, read from the
// Supabase user object. Pure, so the precedence below is testable.
//
// Names and photos live in `user_metadata`: Google sign-in fills full_name and
// avatar_url on its own, and the Account card on the Journey page writes
// display_name and avatar_url through auth.updateUser. No profile table: every
// place that needs a name already has the user object in hand.

/** The part of the email before the @, the fallback the app has always shown. */
function emailHandle(user) {
  const email = user?.email || "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * The name to show: what they set themselves, then what Google supplied, then
 * the email handle. Trimmed; an empty display_name does not win over a real
 * fallback, so clearing the box falls back rather than blanking the navbar.
 */
export function displayNameOf(user) {
  const meta = user?.user_metadata || {};
  const pick = [meta.display_name, meta.full_name, meta.name]
    .map((v) => (v || "").trim())
    .find(Boolean);
  return pick || emailHandle(user) || "";
}

/** The photo to show, or null for the initial-in-a-circle fallback. */
export function avatarOf(user) {
  const meta = user?.user_metadata || {};
  const url = meta.avatar_url || meta.picture || "";
  return url ? String(url) : null;
}

/** One capital letter for the fallback avatar; "?" when there is nothing to take it from. */
export function initialOf(name) {
  const first = (name || "").trim()[0];
  return first ? first.toUpperCase() : "?";
}

export const DISPLAY_NAME_MAX = 40;

/** A name as it will be saved: trimmed, single-spaced, capped. */
export function cleanDisplayName(input) {
  return (input || "").replace(/\s+/g, " ").trim().slice(0, DISPLAY_NAME_MAX);
}
