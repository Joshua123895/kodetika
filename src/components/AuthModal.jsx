import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PixelButton from "./PixelButton";

export default function AuthModal({ open, onClose }) {
  const { signInEmail, signUpEmail, signInGoogle, isConfigured } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setError("");
    setPassword("");
    setConfirm("");
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Enter an email and a password.");
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const fn = mode === "signup" ? signUpEmail : signInEmail;
    const { error: err } = await fn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err.message || "Something went wrong.");
      return;
    }
    close();
  };

  const google = async () => {
    setError("");
    const { error: err } = await signInGoogle();
    // On success the browser redirects to Google, so we only land here on error.
    if (err) setError(err.message || "Google sign-in failed.");
  };

  const inputStyle = {
    background: "var(--bg)",
    color: "var(--text)",
    border: "1.5px solid var(--border-strong)",
    fontFamily: "'Courier New', monospace",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "var(--overlay)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6"
        style={{ background: "var(--bg-card)", border: "2px solid #6AAE6F", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2
            className="text-xl font-black"
            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </h2>
          <button
            onClick={close}
            className="text-lg leading-none px-2 hover:brightness-125"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
          Save your stars and continue on any device.
        </p>

        {!isConfigured && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ background: "#E9B44C20", color: "#B9860B", border: "1px solid #E9B44C" }}
          >
            Sign-in isn't configured yet. Add your Supabase keys to <code>.env.local</code>.
          </div>
        )}

        <button
          onClick={google}
          disabled={!isConfigured}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-105 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "#fff", color: "#3c4043", border: "1.5px solid #dadce0", fontFamily: "'Courier New', monospace" }}
        >
          <GoogleG /> Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>OR</span>
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:brightness-105"
            style={inputStyle}
          />
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:brightness-105"
            style={inputStyle}
          />
          {mode === "signup" && (
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Retype password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:brightness-105"
              style={inputStyle}
            />
          )}

          {error && (
            <div className="text-xs" style={{ color: "#FF5F57" }}>
              {error}
            </div>
          )}

          <PixelButton onClick={submit} disabled={busy || !isConfigured} className="w-full">
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </PixelButton>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setConfirm("");
          }}
          className="w-full text-center text-xs mt-4 hover:brightness-125"
          style={{ color: "#6AAE6F", fontFamily: "'Courier New', monospace" }}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
