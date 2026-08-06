import { useEffect, useRef, useState } from "react";
import { Compass, Gamepad2, LogOut, Moon, Star, Sun } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useProgress } from "../hooks/useProgress";
import { TRACKS } from "../data/tracks";
import AuthModal from "./AuthModal";

const GREEN = "#6AAE6F";

const NAV_LINKS = [
  { path: "/tracks", label: "Tracks", icon: Compass },
  { path: "/arcade", label: "Arcade", icon: Gamepad2 },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { getTotalStars } = useProgress();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef(null);

  const displayName = user?.email ? user.email.split("@")[0] : "";
  const initial = displayName ? displayName[0].toUpperCase() : "?";
  const stars = TRACKS.reduce((sum, t) => sum + getTotalStars(t.slug), 0);
  const isActive = (path) => location.pathname.startsWith(path);
  const closeMenu = () => setMenuOpen(false);

  // Flat while sitting over the top of a page, lifted once content slides under it.
  //
  // index.css pins html, body and #root to height:100%, which makes BODY the
  // scroll container rather than the viewport — window.scrollY is permanently 0
  // on this site, so the obvious version of this listener silently never fires.
  // Read whichever element actually moved, and listen in the capture phase
  // because scroll events do not bubble.
  useEffect(() => {
    const offset = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const onScroll = () => setScrolled(offset() > 8);
    // Scheduled, not called inline: a browser that restores scroll position on
    // back-navigation lands mid-page, and a synchronous setState here would
    // cascade a second render on every mount.
    const initial = setTimeout(onScroll, 0);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      clearTimeout(initial);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  // Escape closes whichever layer is open, outermost first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (accountOpen) setAccountOpen(false);
      else if (menuOpen) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountOpen, menuOpen]);

  // Click-away for the account dropdown.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDown = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  // The drawer is a modal surface — the page must not scroll behind it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  // Every in-menu link already closes on click. Back/forward does not go through
  // those handlers, though, and would leave the drawer sitting open over the new
  // page — so listen for the history event itself.
  useEffect(() => {
    const onPop = () => { setMenuOpen(false); setAccountOpen(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between md:px-6 md:py-2.5 px-3 py-2"
        style={{
          background: "var(--nav-bg)",
          borderBottom: `3px solid ${GREEN}`,
          boxShadow: scrolled ? "0 6px 20px -10px rgba(0,0,0,0.6)" : "none",
          transition: "box-shadow 250ms ease",
        }}
      >
        <button
          onClick={() => { navigate("/"); closeMenu(); }}
          className="flex items-center gap-2 group rounded-lg px-1 py-1 -ml-1"
        >
          <img
            src="/favicon.svg"
            alt=""
            className="w-7 h-7 md:w-8 md:h-8 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105"
            style={{ borderRadius: 6 }}
          />
          <span
            className="font-bold text-sm md:text-lg tracking-wide"
            style={{ color: "var(--nav-text)", fontFamily: "'Courier New', monospace" }}
          >
            Step Into <span style={{ color: GREEN }}>Code</span>
          </span>
        </button>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ path, label, icon: LinkIcon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                aria-current={active ? "page" : undefined}
                className="relative px-3 py-2 text-sm font-bold rounded-lg transition-colors duration-200"
                style={{
                  color: active ? GREEN : "var(--text-muted)",
                  background: active ? `${GREEN}18` : "transparent",
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "0.03em",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--nav-text)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <LinkIcon size={14} strokeWidth={2.5} /> {label}
                </span>
                {/* The pill alone read as a hover state; the bar makes "you are
                    here" unambiguous. */}
                <span
                  className="absolute left-3 right-3 rounded-full transition-all duration-200"
                  style={{ bottom: 2, height: 2, background: GREEN, opacity: active ? 1 : 0 }}
                />
              </button>
            );
          })}

          {user && stars > 0 && (
            <span
              className="ml-1 px-2.5 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1"
              style={{ color: "#E9B44C", background: "#E9B44C18", fontFamily: "'Courier New', monospace" }}
              title={`${stars} stars earned`}
            >
              <Star size={12} strokeWidth={2.5} fill="currentColor" /> {stars}
            </span>
          )}

          <button
            onClick={toggle}
            className="ml-1 w-9 h-9 flex items-center justify-center rounded-lg transition-colors duration-200"
            style={{ color: "var(--nav-text)", background: "transparent" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${GREEN}18`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={16} strokeWidth={2.5} /> : <Moon size={16} strokeWidth={2.5} />}
          </button>

          {user ? (
            <div className="relative ml-1" ref={accountRef}>
              {/* One avatar instead of a name pill plus a Log out button — those
                  two took as much room as the whole nav and gave sign-out the
                  same weight as navigation. */}
              <button
                onClick={() => setAccountOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-transform duration-150 hover:scale-105"
                style={{ background: GREEN, color: "#fff", fontFamily: "'Courier New', monospace" }}
                title={user.email}
              >
                {initial}
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden"
                  style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)", boxShadow: "0 16px 40px -16px rgba(0,0,0,0.6)" }}
                >
                  <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border-strong)" }}>
                    <div className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>{displayName}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{user.email}</div>
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between text-xs" style={{ borderBottom: "1px solid var(--border-strong)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Stars earned</span>
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: "#E9B44C" }}>
                      <Star size={11} strokeWidth={2.5} fill="currentColor" /> {stars}
                    </span>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => { setAccountOpen(false); signOut(); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-bold transition-colors hover:brightness-125"
                    style={{ color: "#FF5F57", background: "transparent" }}
                  >
                    <span className="inline-flex items-center gap-1.5"><LogOut size={12} strokeWidth={2.5} /> Log out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="ml-2 px-4 py-2 text-sm font-bold rounded-lg transition-all hover:brightness-110 active:translate-y-0.5"
              style={{ background: GREEN, color: "#fff", fontFamily: "'Courier New', monospace", letterSpacing: "0.03em" }}
            >
              Sign In
            </button>
          )}
        </div>

        {/* Mobile: theme stays reachable without opening the drawer */}
        <div className="md:hidden flex items-center gap-1">
          <button
            onClick={toggle}
            className="w-10 h-10 flex items-center justify-center rounded-lg"
            style={{ color: "var(--nav-text)" }}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={17} strokeWidth={2.5} /> : <Moon size={17} strokeWidth={2.5} />}
          </button>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="relative w-11 h-11 flex items-center justify-center"
            style={{ color: "var(--nav-text)" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span className="absolute block w-5 h-0.5 rounded-full transition-all duration-300 ease-in-out"
              style={{ background: "var(--nav-text)", transform: menuOpen ? "rotate(45deg)" : "translateY(-4px)" }} />
            <span className="absolute block w-5 h-0.5 rounded-full transition-all duration-300 ease-in-out"
              style={{ background: "var(--nav-text)", opacity: menuOpen ? 0 : 1, transform: menuOpen ? "translateX(-10px)" : "translateY(0)" }} />
            <span className="absolute block w-5 h-0.5 rounded-full transition-all duration-300 ease-in-out"
              style={{ background: "var(--nav-text)", transform: menuOpen ? "rotate(-45deg)" : "translateY(4px)" }} />
          </button>
        </div>
      </nav>

      <div
        className="md:hidden fixed inset-0 z-30 transition-opacity duration-300"
        style={{ background: "var(--overlay)", opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? "auto" : "none" }}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <aside
        className="fixed top-0 right-0 z-40 h-full w-72 flex flex-col"
        style={{
          background: "var(--nav-bg)",
          borderLeft: `3px solid ${GREEN}`,
          transform: menuOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        aria-hidden={!menuOpen}
      >
        {/* Cleared past the nav bar, which sits above this panel — anything in
            the first 3.5rem would be hidden behind it. The hamburger has already
            morphed into an X up there, so the drawer needs no close button of
            its own. */}
        <div style={{ height: "3.5rem" }} />

        {user && (
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-strong)" }}>
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: GREEN, color: "#fff", fontFamily: "'Courier New', monospace" }}
            >
              {initial}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: "var(--nav-text)" }}>{displayName}</div>
              <div className="text-[11px] inline-flex items-center gap-1" style={{ color: "#E9B44C" }}>
                <Star size={10} strokeWidth={2.5} fill="currentColor" /> {stars} stars
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 p-4 flex-1">
          {NAV_LINKS.map(({ path, label, icon: LinkIcon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => { navigate(path); closeMenu(); }}
                aria-current={active ? "page" : undefined}
                className="w-full text-left px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200"
                style={{
                  color: active ? GREEN : "var(--nav-text)",
                  background: active ? `${GREEN}18` : "transparent",
                  border: `1.5px solid ${active ? `${GREEN}60` : "var(--border-strong)"}`,
                  fontFamily: "'Courier New', monospace",
                }}
              >
                <span className="inline-flex items-center gap-2"><LinkIcon size={15} strokeWidth={2.5} /> {label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4" style={{ borderTop: "1px solid var(--border-strong)" }}>
          {user ? (
            <button
              onClick={() => { signOut(); closeMenu(); }}
              className="w-full text-left px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200"
              style={{ color: "#FF5F57", border: "1.5px solid var(--border-strong)", fontFamily: "'Courier New', monospace" }}
            >
              <span className="inline-flex items-center gap-2"><LogOut size={14} strokeWidth={2.5} /> Log out</span>
            </button>
          ) : (
            <button
              onClick={() => { setAuthOpen(true); closeMenu(); }}
              className="w-full px-4 py-3 text-sm font-bold rounded-lg transition-all hover:brightness-110"
              style={{ background: GREEN, color: "#fff", fontFamily: "'Courier New', monospace", letterSpacing: "0.03em" }}
            >
              Sign In
            </button>
          )}
        </div>
      </aside>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
