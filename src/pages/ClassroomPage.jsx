import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, Flame, GraduationCap, Plus, RotateCcw, Star, Trash2, Users } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useAuth } from "../context/AuthContext";
import PixelButton from "../components/PixelButton";
import { RosterSkeleton, ClassListSkeleton } from "../components/Skeleton";
import { rosterRows, classSummary, classSoftSpots, studentDetail, IDLE_DAYS } from "../lib/roster";
import {
  createClass,
  deleteClass,
  joinClass,
  leaveClass,
  myClasses,
  myMemberships,
  roster,
  setArchived,
} from "../lib/classroom";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";
const RED = "#FF5F57";

const card = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
};

function Heading({ children }) {
  return (
    <h2
      className="text-sm font-bold mb-4"
      style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
    >
      {children}
    </h2>
  );
}

function Note({ children, tone = "muted" }) {
  const color = tone === "error" ? RED : "var(--text-muted)";
  return <p className="text-xs mt-2" style={{ color }}>{children}</p>;
}

/** The code, big enough to read off a projector, with a copy button. */
function JoinCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard can be blocked; the code is on screen either way.
        }
      }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold hover:brightness-125 transition"
      style={{ color: AMBER, background: `${AMBER}18`, fontFamily: "'Courier New', monospace", letterSpacing: "0.12em" }}
      title="Copy the join code"
    >
      {code}
      {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} strokeWidth={2.5} />}
    </button>
  );
}

function StudentRow({ row, onOpen, onRemove }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={card}>
      <button onClick={() => onOpen(row)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
            {row.name}
          </span>
          {row.needsHelp && (
            <AlertTriangle size={13} strokeWidth={2.5} style={{ color: AMBER, flexShrink: 0 }} />
          )}
        </div>

        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {row.levels === 0
            ? "Has not started yet"
            : `${row.levels} levels · ${row.stars} stars${row.furthest ? ` · ${row.furthest.name}` : ""}`}
        </div>

        {row.stuck.length > 0 && (
          <div className="text-xs mt-1.5" style={{ color: AMBER }}>
            Stuck on {row.stuck.map((s) => `${s.levelName} (${s.fails})`).join(", ")}
          </div>
        )}

        {row.idleDays !== null && row.idleDays >= IDLE_DAYS && (
          <div className="text-xs mt-1.5" style={{ color: AMBER }}>
            No submissions for {row.idleDays} days
          </div>
        )}
      </button>

      <button
        onClick={() => onRemove(row)}
        className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition flex-shrink-0"
        style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
      >
        Remove
      </button>
    </div>
  );
}

/**
 * One student, in the same shape as their own Journey page. Read-only: the
 * teacher can look, not touch, and the underlying view never included the
 * student's code in the first place.
 */
function StudentDetail({ detail, onBack }) {
  const navigate = useNavigate();
  const joined = detail.joinedAt
    ? new Date(detail.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  return (
    <>
      <button
        onClick={onBack}
        className="text-xs flex items-center gap-1.5 mb-4 hover:gap-2.5 transition-all"
        style={{ color: GREEN }}
      >
        <ArrowLeft size={13} strokeWidth={2.5} /> Register
      </button>

      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
      >
        {detail.name}
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        {joined ? `Joined ${joined}. ` : ""}
        {detail.levels === 0
          ? "Has not started yet."
          : `${detail.levels} levels across ${detail.tracks.length} ${detail.tracks.length === 1 ? "track" : "tracks"}.`}
      </p>

      {detail.levels > 0 && (
        <div className="rounded-2xl p-5 mb-6 grid grid-cols-3 gap-5" style={card}>
          {[
            { v: detail.stars, l: "stars", c: AMBER, icon: Star },
            { v: `${detail.mastery}%`, l: "mastered", c: GREEN },
            { v: detail.streak, l: "day streak", c: "#FF7B54", icon: Flame },
          ].map((f) => (
            <div key={f.l}>
              <div
                className="text-2xl font-bold flex items-center gap-1.5"
                style={{ color: f.c, fontFamily: "'Courier New', monospace" }}
              >
                {f.icon && <f.icon size={16} strokeWidth={2.5} />}
                {f.v}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{f.l}</div>
            </div>
          ))}
        </div>
      )}

      {detail.tracks.length > 0 && (
        <>
          <Heading>TRACKS</Heading>
          <div className="space-y-2 mb-8">
            {detail.tracks.map((t) => (
              <div key={t.slug} className="rounded-xl p-4" style={card}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                    {t.name}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                    {t.done}/{t.total} · {t.stars} of {t.maxStars} stars
                  </span>
                </div>
                <div className="h-1.5 rounded-full mt-2" style={{ background: `${GREEN}25` }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.pct}%`, background: t.complete ? AMBER : GREEN }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detail.spots.length > 0 && (
        <>
          <Heading>STRUGGLING WITH</Heading>
          <div className="space-y-2">
            {detail.spots.map((sp) => (
              <button
                key={`${sp.trackSlug}-${sp.levelId}`}
                onClick={() => navigate(sp.path)}
                className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left hover:brightness-110 transition"
                style={card}
                title="Open the level to see what it asks"
              >
                <RotateCcw size={15} strokeWidth={2.5} style={{ color: AMBER, flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                    {sp.levelName}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {sp.trackName} · {sp.chapterName}
                  </div>
                </div>
                <span
                  className="text-xs flex-shrink-0 px-2 py-1 rounded-md"
                  style={{ color: AMBER, background: `${AMBER}18` }}
                >
                  {sp.fails} {sp.fails === 1 ? "retry" : "retries"}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Roster({ klass, onBack }) {
  // The raw view rows are kept, not just the derived register lines: the
  // per-student page needs the progress and practice blobs themselves.
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [openStudent, setOpenStudent] = useState(null);

  const load = useCallback(async () => {
    try {
      setMembers(await roster(klass.id));
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load the class.");
      setMembers([]);
    }
  }, [klass.id]);

  // Inlined rather than calling load(), matching the shape ProgressContext
  // already uses: the cancel flag stops a slow response writing into a view the
  // teacher has already navigated away from.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await roster(klass.id);
        if (cancelled) return;
        setMembers(fetched);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Could not load the class.");
        setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [klass.id]);

  const rows = useMemo(() => (members ? rosterRows(TRACKS, members) : null), [members]);
  const summary = useMemo(() => (rows ? classSummary(rows) : null), [rows]);
  const hotspots = useMemo(() => (members ? classSoftSpots(TRACKS, members) : []), [members]);

  const remove = async (row) => {
    // Arm then confirm, the same pattern AdminReset uses: window.confirm blocks
    // the whole tab and reads as a browser error rather than a decision.
    if (confirming !== row.studentId) {
      setConfirming(row.studentId);
      setTimeout(() => setConfirming((c) => (c === row.studentId ? null : c)), 4000);
      return;
    }
    setConfirming(null);
    try {
      await leaveClass(klass.id, row.studentId);
      setOpenStudent(null);
      await load();
    } catch (e) {
      setError(e.message || "Could not remove that student.");
    }
  };

  const destroy = async () => {
    // Same arm-then-confirm as removing a student, but held in its own state so
    // arming a delete cannot be mistaken for arming a removal.
    if (!deleting) {
      setDeleting(true);
      setTimeout(() => setDeleting(false), 4000);
      return;
    }
    try {
      await deleteClass(klass.id);
      onBack();
    } catch (e) {
      setDeleting(false);
      setError(e.message || "Could not delete the class.");
    }
  };

  // The per-student page. Members are re-found by id on every render, so a
  // removal or a reload cannot leave the detail showing a stale copy.
  const openMember = openStudent && (members || []).find((m) => m.student_id === openStudent);
  if (openMember) {
    return (
      <StudentDetail
        detail={studentDetail(TRACKS, openMember)}
        onBack={() => setOpenStudent(null)}
      />
    );
  }

  return (
    <>
      <button
        onClick={onBack}
        className="text-xs flex items-center gap-1.5 mb-4 hover:gap-2.5 transition-all"
        style={{ color: GREEN }}
      >
        <ArrowLeft size={13} strokeWidth={2.5} /> All classes
      </button>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {klass.name}
        </h1>
        <JoinCode code={klass.join_code} />
        <button
          onClick={destroy}
          className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition inline-flex items-center gap-1"
          style={
            deleting
              ? { color: RED, background: `${RED}18`, border: `1px solid ${RED}60`, fontWeight: 700 }
              : { color: "var(--text-muted)", border: "1px solid var(--border)" }
          }
          title="Delete this class. Students keep all their progress."
        >
          <Trash2 size={11} strokeWidth={2.5} />
          {deleting ? "Really delete?" : "Delete"}
        </button>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Students join at Journey → Classes with that code.
      </p>

      {error && <Note tone="error">{error}</Note>}

      {summary && summary.students > 0 && (
        <div className="rounded-2xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-5" style={card}>
          {[
            { v: summary.students, l: "students", c: "#7AA2F7" },
            { v: summary.needHelp, l: "need a nudge", c: summary.needHelp > 0 ? AMBER : GREEN },
            { v: summary.activeToday, l: "active today", c: GREEN },
            { v: summary.medianLevels, l: "median levels", c: "var(--text)" },
          ].map((f) => (
            <div key={f.l}>
              <div
                className="text-2xl font-bold"
                style={{ color: f.c, fontFamily: "'Courier New', monospace" }}
              >
                {f.v}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{f.l}</div>
            </div>
          ))}
        </div>
      )}

      {hotspots.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={card}>
          <div
            className="text-xs font-bold mb-3"
            style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
          >
            THE CLASS IS STRUGGLING WITH
          </div>
          <div className="space-y-2">
            {hotspots.map((h) => (
              <div key={`${h.trackSlug}-${h.levelId}`} className="flex items-center gap-3 text-sm">
                <RotateCcw size={13} strokeWidth={2.5} style={{ color: AMBER, flexShrink: 0 }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text)" }}>
                  <strong>{h.levelName}</strong>
                  <span style={{ color: "var(--text-muted)" }}> · {h.trackName}</span>
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: AMBER }}>
                  {h.students} {h.students === 1 ? "student" : "students"} · {h.fails} retries
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows === null && <RosterSkeleton />}

      {rows !== null && rows.length === 0 && !error && (
        <div className="rounded-2xl p-6 text-center" style={card}>
          <Users size={22} strokeWidth={2} style={{ color: "var(--text-muted)", margin: "0 auto" }} />
          <p className="text-sm mt-3" style={{ color: "var(--text)" }}>Nobody has joined yet.</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Share the code <strong style={{ color: AMBER }}>{klass.join_code}</strong> with your class.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(rows || []).map((row) => (
          <div key={row.studentId}>
            <StudentRow row={row} onOpen={(r) => setOpenStudent(r.studentId)} onRemove={remove} />
            {confirming === row.studentId && (
              <div className="flex items-center gap-2 mt-1.5 mb-1 px-1">
                <span className="text-xs" style={{ color: RED }}>
                  Remove {row.name} from this class?
                </span>
                <button
                  onClick={() => remove(row)}
                  className="text-[11px] px-2 py-1 rounded-md font-bold"
                  style={{ color: RED, background: `${RED}18` }}
                >
                  Yes, remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function ClassroomPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // null means the fetch is still in flight, so the lists render as skeleton
  // cards rather than a silent gap. Errors settle them to [] so the skeleton
  // cannot shimmer forever next to the error note.
  const [taught, setTaught] = useState(null);
  const [joined, setJoined] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [nameOverride, setNameOverride] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [mine, memberships] = await Promise.all([
          myClasses(user.id),
          myMemberships(user.id),
        ]);
      setTaught(mine);
      setJoined(memberships);
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load your classes.");
      setTaught((prev) => prev ?? []);
      setJoined((prev) => prev ?? []);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, memberships] = await Promise.all([
          myClasses(user.id),
          myMemberships(user.id),
        ]);
        if (cancelled) return;
        setTaught(mine);
        setJoined(memberships);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Could not load your classes.");
        setTaught((prev) => prev ?? []);
        setJoined((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Defaults to the part of the email before the @, which is what the rest of
  // the app already shows, while letting them change it: the teacher's register
  // should say what the student wants to be called. Derived rather than an
  // effect, so clearing the box leaves it cleared instead of refilling itself.
  const studentName = nameOverride ?? (user?.email ? user.email.split("@")[0] : "");

  if (!user) {
    return (
      <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
        <div className="max-w-2xl mx-auto text-center">
          <GraduationCap size={26} strokeWidth={2} style={{ color: GREEN, margin: "0 auto" }} />
          <h1
            className="text-2xl font-bold mt-4 mb-2"
            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
          >
            Classes
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            A class is shared between people, so this one needs an account. Sign in from the menu
            and come back.
          </p>
          <div className="mt-6">
            <PixelButton onClick={() => navigate("/profile")} size="md">
              Your journey
            </PixelButton>
          </div>
        </div>
      </div>
    );
  }

  const create = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      setError(null);
      const made = await createClass(newName, user.id);
      setNewName("");
      setTaught((prev) => [made, ...prev]);
    } catch (e) {
      setError(e.message || "Could not create the class.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim() || !studentName.trim() || busy) return;
    setBusy(true);
    try {
      setError(null);
      await joinClass(code, studentName);
      setCode("");
      await load();
    } catch (e) {
      setError(e.message || "Could not join that class.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-3xl mx-auto">
        {open ? (
          <Roster klass={open} onBack={() => { setOpen(null); load(); }} />
        ) : (
          <>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              Classes
            </h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
              Teach a class and watch where people get stuck, or join one with a code.
            </p>

            {error && <Note tone="error">{error}</Note>}

            <div className="mt-6">
              <Heading>TEACHING</Heading>

              {taught === null && <ClassListSkeleton rows={1} />}
              <div className="space-y-2">
                {(taught ?? []).map((k) => (
                  <div key={k.id} className="rounded-xl p-4 flex items-center gap-3" style={card}>
                    <button onClick={() => setOpen(k)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                        {k.name}
                        {k.archived && (
                          <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            closed
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Open the register
                      </div>
                    </button>
                    <JoinCode code={k.join_code} />
                    <button
                      onClick={async () => {
                        try {
                          await setArchived(k.id, !k.archived);
                          await load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                      className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition"
                      style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                      title={k.archived ? "Let students join again" : "Stop new students joining"}
                    >
                      {k.archived ? "Reopen" : "Close"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-xl p-4 mt-2 flex flex-col sm:flex-row gap-2" style={card}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="New class name"
                  maxLength={80}
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
                />
                <PixelButton onClick={create} size="md" disabled={busy || !newName.trim()}>
                  <Plus size={14} className="inline mr-1" /> Create
                </PixelButton>
              </div>
            </div>

            <div className="mt-10">
              <Heading>LEARNING</Heading>

              {joined === null && <ClassListSkeleton rows={1} />}
              <div className="space-y-2">
                {(joined ?? []).map((m) => (
                  <div key={m.class_id} className="rounded-xl p-4 flex items-center gap-3" style={card}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                        {m.classes?.name || "A class"}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        You appear as {m.display_name}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await leaveClass(m.class_id, user.id);
                          await load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                      className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition flex-shrink-0"
                      style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                    >
                      Leave
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-xl p-4 mt-2" style={card}>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && join()}
                    placeholder="CODE"
                    maxLength={8}
                    className="px-3 py-2 rounded-lg text-sm outline-none sm:w-32"
                    style={{
                      background: "var(--bg)",
                      border: "1.5px solid var(--border)",
                      color: "var(--text)",
                      fontFamily: "'Courier New', monospace",
                      letterSpacing: "0.12em",
                    }}
                  />
                  <input
                    value={studentName}
                    onChange={(e) => setNameOverride(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && join()}
                    placeholder="Your name"
                    maxLength={40}
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg)", border: "1.5px solid var(--border)", color: "var(--text)" }}
                  />
                  <PixelButton onClick={join} size="md" disabled={busy || !code.trim() || !studentName.trim()}>
                    Join
                  </PixelButton>
                </div>
                <Note>
                  Your teacher sees this name, your stars and where you get stuck. Never your code.
                </Note>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
