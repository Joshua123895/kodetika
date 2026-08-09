import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isAdminEmail } from "../lib/admin";

const AuthContext = createContext(null);

const notConfigured = async () => ({
  error: { message: "Sign-in isn't set up yet (missing Supabase keys)." },
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // Only "loading" while we actually have a client to ask; otherwise resolve
  // immediately so the UI never hangs on a disabled auth setup.
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    // When unconfigured, `loading` already starts false (isSupabaseConfigured),
    // so there's nothing to resolve — just skip the session wiring.
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    // Derived from the signed-in address every render rather than stored: there
    // is no admin state to get out of sync, and signing out clears it for free.
    isAdmin: isAdminEmail(session?.user?.email),
    loading,
    isConfigured: isSupabaseConfigured,
    signUpEmail: (email, password) =>
      supabase ? supabase.auth.signUp({ email, password }) : notConfigured(),
    signInEmail: (email, password) =>
      supabase ? supabase.auth.signInWithPassword({ email, password }) : notConfigured(),
    signInGoogle: () =>
      supabase
        ? supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin },
          })
        : notConfigured(),
    signOut: () => (supabase ? supabase.auth.signOut() : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
