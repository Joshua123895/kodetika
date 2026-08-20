import { createClient } from "@supabase/supabase-js";

// The URL + anon key come from env (see .env.example, and Vercel env settings).
// The anon key is safe to ship in the browser bundle; the database is protected
// by Row Level Security, not by hiding this key. If either var is missing the
// client is null and the whole app falls back to localStorage-only progress, so
// the site still works before Supabase is configured.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = Boolean(supabase);
