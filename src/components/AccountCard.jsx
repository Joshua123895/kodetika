import { useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { avatarOf, cleanDisplayName, displayNameOf, initialOf, DISPLAY_NAME_MAX } from "../lib/profile";
import { uploadAvatar } from "../lib/avatar";
import PixelButton from "./PixelButton";

const GREEN = "#6AAE6F";
const RED = "#FF5F57";

/** The avatar as every corner of the app draws it: the photo, or an initial. */
export function Avatar({ user, size = 36, className = "" }) {
  const photo = avatarOf(user);
  const name = displayNameOf(user);
  const style = { width: size, height: size };
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={style}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={`rounded-full flex items-center justify-center font-black shrink-0 ${className}`}
      style={{ ...style, background: GREEN, color: "#fff", fontFamily: "'Courier New', monospace", fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}

/**
 * Who the account is: the photo and the name, both editable. Sits at the top
 * of the Journey page. The name is what classmates, teachers and certificates
 * see; the photo is a 256px square kept in the avatars bucket.
 */
export default function AccountCard() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(() => displayNameOf(user));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  if (!user) return null;

  const saveName = async () => {
    const clean = cleanDisplayName(name);
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await updateProfile({ display_name: clean });
    setBusy(false);
    if (err) {
      setError(err.message || "Could not save the name.");
      return;
    }
    setName(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const changePhoto = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadAvatar(user.id, file);
      const { error: err } = await updateProfile({ avatar_url: url });
      if (err) throw err;
    } catch (e) {
      setError(e.message || "Could not upload that photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      className="rounded-2xl p-5 mb-6 flex flex-wrap items-center gap-4"
      style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
    >
      <button
        onClick={() => fileRef.current?.click()}
        className="relative group rounded-full shrink-0"
        title="Change photo"
        aria-label="Change profile photo"
        disabled={busy}
      >
        <Avatar user={user} size={64} />
        <span
          className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }}
        >
          <Camera size={18} strokeWidth={2.5} />
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => changePhoto(e.target.files?.[0])}
      />

      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
          Account
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            maxLength={DISPLAY_NAME_MAX}
            placeholder="Your name"
            className="flex-1 min-w-40 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text)" }}
            aria-label="Display name"
          />
          <PixelButton onClick={saveName} size="sm" disabled={busy || !cleanDisplayName(name) || cleanDisplayName(name) === displayNameOf(user)}>
            {saved ? <span className="inline-flex items-center gap-1"><Check size={12} strokeWidth={3} /> Saved</span> : "Save"}
          </PixelButton>
        </div>
        <div className="text-xs mt-1.5 truncate" style={{ color: "var(--text-muted)" }}>
          {user.email} · click the picture to change it
        </div>
        {error && <div className="text-xs mt-1" style={{ color: RED }}>{error}</div>}
      </div>
    </div>
  );
}
