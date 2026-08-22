import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowDownUp, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Flame, GraduationCap, GripVertical, Pencil, Plus, RotateCcw, Star, Trash2, Users, Video, X } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useAuth } from "../context/AuthContext";
import PixelButton from "../components/PixelButton";
import { RosterSkeleton, ClassListSkeleton } from "../components/Skeleton";
import { rosterRows, classSummary, classSoftSpots, studentDetail, IDLE_DAYS } from "../lib/roster";
import {
  createClass,
  deleteClass,
  deleteMeeting,
  joinClass,
  leaveClass,
  logMeeting,
  meetings,
  myClasses,
  myMemberships,
  roster,
  setArchived,
  setMeetLink,
  setMeetingPayment,
  studentMeetings,
  updateMeeting,
  reorderMeetings,
} from "../lib/classroom";
import {
  byDate,
  cyclePayment,
  formatMetDate,
  isSequential,
  linkHref,
  moveItem,
  nextMeetingNumber,
  PAYMENT_LABELS,
  paymentSummary,
  renumberPlan,
  sortBook,
} from "../lib/meetings";
import { displayNameOf } from "../lib/profile";
import { Avatar } from "../components/AccountCard";
import DatePicker from "../components/DatePicker";
import { watchTables } from "../lib/classroomLive";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";
const RED = "#FF5F57";

const card = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border-strong)",
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

function StudentRow({ row, book = [], onOpen, onRemove }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={card}>
      {/* The face first: a teacher scanning a register recognises a photo
          faster than they read a name. Falls back to the initial. */}
      <Avatar user={{ user_metadata: { avatar_url: row.avatar }, email: row.name }} size={36} />
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

        {book.length > 0 && (
          <div
            className="text-xs mt-1"
            style={{ color: book.some((m) => m.payment === "unpaid") ? AMBER : "var(--text-muted)" }}
          >
            Meet #{Math.max(...book.map((m) => m.num))} · {paymentSummary(book)}
          </div>
        )}

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
        style={{ color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
      >
        Remove
      </button>
    </div>
  );
}

// The star-quality ramp: one hue, dark to light, in the order the stars rank.
// Sequential on purpose — 3, 2 and 1 stars are ordered grades of the same
// thing, not three separate categories. Lightness carries the order, so the
// bar reads the same to colorblind readers, and the 2px gaps between segments
// plus the counts text beside each bar carry it without color at all.
const STAR_RAMP = { three: "#35793C", two: "#6AAE6F", one: "#B7D9B9" };

/**
 * One track as a stacked quality bar: how much of it is done, and how well.
 * Segments are 3-star, 2-star, 1-star; the remaining track is untouched.
 */
function StarBar({ three = 0, two = 0, one = 0, total = 0 }) {
  if (total <= 0) return null;
  const seg = (n, color, label) =>
    n > 0 ? (
      <div
        key={label}
        title={`${n} ${n === 1 ? "level" : "levels"} at ${label}`}
        className="h-full"
        style={{ width: `${(n / total) * 100}%`, background: color }}
      />
    ) : null;
  return (
    <div
      className="h-3 rounded-full mt-2 flex gap-[2px] overflow-hidden"
      style={{ background: "var(--bar-track)" }}
      role="img"
      aria-label={`${three} at three stars, ${two} at two, ${one} at one, of ${total} levels`}
    >
      {seg(three, STAR_RAMP.three, "3 stars")}
      {seg(two, STAR_RAMP.two, "2 stars")}
      {seg(one, STAR_RAMP.one, "1 star")}
    </div>
  );
}

function StarLegend() {
  const items = [
    [STAR_RAMP.three, "3 stars"],
    [STAR_RAMP.two, "2 stars"],
    [STAR_RAMP.one, "1 star"],
    ["var(--bar-track)", "not done"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * One student, in the same shape as their own Journey page. Read-only: the
 * teacher can look, not touch, and the underlying view never included the
 * student's code in the first place.
 */
function StudentDetail({ detail, classId, studentId, onBack }) {
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

      <div className="flex items-center gap-3 mb-1">
        <Avatar user={{ user_metadata: { avatar_url: detail.avatar }, email: detail.name }} size={44} />
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {detail.name}
        </h1>
      </div>
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

      <StudentMeetings classId={classId} studentId={studentId} />

      {detail.tracks.length > 0 && (
        <>
          <Heading>HOW WELL, TRACK BY TRACK</Heading>
          <div className="rounded-2xl p-4 mb-8" style={card}>
            <StarLegend />
            <div className="space-y-3">
              {detail.tracks.map((t) => (
                <div key={t.slug}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                      {t.name}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                      {t.done}/{t.total} · {t.stars} of {t.maxStars} stars
                    </span>
                  </div>
                  <StarBar three={t.threeStar} two={t.twoStar} one={t.oneStar} total={t.total} />
                </div>
              ))}
            </div>
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

const PAYMENT_COLORS = {
  // Not paid is the actionable one, so it carries the warning colour; a
  // cancelled meeting is a void row, not an alarm.
  unpaid: AMBER,
  paid: GREEN,
  cancelled: "var(--text-muted)",
};
/**
 * The class's one meeting link, saved on the class row. The books themselves
 * hang off each student (see StudentMeetings): numbering and payment are per
 * student, because two students in the same class can be on meeting 12 and
 * meeting 3 at once.
 */
function MeetLinkRow({ klass }) {
  const [link, setLink] = useState(klass.meet_link || "");
  // The address the Open button uses: what the row arrived with, then whatever
  // was last saved, without mutating the parent's copy of the class.
  const [savedLink, setSavedLink] = useState(klass.meet_link || "");
  const [linkSaved, setLinkSaved] = useState(false);
  const [error, setError] = useState(null);

  const saveLink = async () => {
    try {
      setError(null);
      await setMeetLink(klass.id, link);
      setSavedLink(link.trim());
      setLinkSaved(true);
      setTimeout(() => setLinkSaved(false), 1600);
    } catch (e) {
      setError(e.message || "Could not save the link.");
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <Video size={15} strokeWidth={2.5} style={{ color: GREEN, flexShrink: 0 }} />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveLink()}
          placeholder="Meeting link (Zoom, Meet, anything)"
          maxLength={500}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs outline-none"
          style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text)" }}
        />
        <button
          onClick={saveLink}
          className="text-[11px] px-2 py-1.5 rounded-md hover:brightness-125 transition flex-shrink-0"
          style={{ color: linkSaved ? GREEN : "var(--text-muted)", border: "1px solid var(--border-strong)" }}
        >
          {linkSaved ? "Saved" : "Save"}
        </button>
        {savedLink && (
          <a
            href={linkHref(savedLink)}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 p-1.5 rounded-md hover:brightness-125 transition"
            style={{ color: GREEN, border: `1px solid ${GREEN}60` }}
            title="Open the meeting link"
          >
            <ExternalLink size={13} strokeWidth={2.5} />
          </a>
        )}
      </div>
      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
/**
 * The meeting book as a real table, shared by both sides of the desk: the
 * teacher gets the payment chip, the pencil and the delete; a student gets the
 * same rows read-only (their SELECT policy is 004). Sorting is local state,
 * any header column, click again to flip.
 */
/** One sortable column header. Hoisted out of the table so it is not re-created every render. */
function SortTh({ col, label, grow = false, sort, onSort }) {
  const active = sort.key === col;
  return (
    <th className={`text-left font-bold pb-2 pr-3 ${grow ? "w-full" : ""}`}>
      <button
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider hover:brightness-125 transition whitespace-nowrap"
        style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? <ChevronUp size={12} strokeWidth={2.5} /> : <ChevronDown size={12} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={12} strokeWidth={2.5} style={{ opacity: 0.3 }} />
        )}
      </button>
    </th>
  );
}

function MeetingsTable({ meets, readOnly = false, onCycle, onDelete, onUpdate, onReorder }) {
  const [sort, setSort] = useState({ key: "num", dir: "desc" });
  // Tracked by meeting id, not row index: the book updates live (another
  // device logging a meeting, or the teacher on a second screen), and an
  // index captured at dragstart would point at a different row by the drop.
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ num: "", met_on: "", note: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => sortBook(meets, sort.key, sort.dir), [meets, sort]);

  // Dragging only makes sense while the table is in its own numbered order:
  // in a list sorted by payment, "put this one third" has nothing to mean.
  const canDrag = !readOnly && Boolean(onReorder) && sort.key === "num";

  const drop = (toId) => {
    const fromId = dragId;
    setDragId(null);
    setOverId(null);
    if (!fromId || fromId === toId) return;
    // Resolved against the list as it stands NOW, so a row that arrived or
    // left mid-drag cannot make this move the wrong meeting.
    const from = sorted.findIndex((m) => m.id === fromId);
    const to = sorted.findIndex((m) => m.id === toId);
    if (from < 0 || to < 0) return;
    const moved = moveItem(sorted, from, to);
    // The rows are numbered low to high whatever way round they are shown, so
    // a descending view has to be flipped before the numbers are handed out.
    const ascending = sort.dir === "desc" ? [...moved].reverse() : moved;
    onReorder(ascending);
  };

  const clickSort = (key) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const startEdit = (m) => {
    setEditing(m.id);
    setDraft({ num: String(m.num), met_on: m.met_on, note: m.note || "" });
    setError(null);
  };

  const saveEdit = async (m) => {
    const n = parseInt(draft.num, 10);
    if (!Number.isFinite(n) || n < 1 || !draft.met_on || busy) return;
    setBusy(true);
    try {
      setError(null);
      await onUpdate(m, { num: n, met_on: draft.met_on, note: draft.note });
      setEditing(null);
    } catch (e) {
      setError(e.code === "23505" ? `Meeting ${n} is already in this book.` : e.message || "Could not save the change.");
    } finally {
      setBusy(false);
    }
  };

  const editInput = {
    background: "var(--bg)",
    border: "1.5px solid var(--border-strong)",
    color: "var(--text)",
  };

  return (
    <div className="overflow-x-auto">
      {error && <p className="text-xs mb-2" style={{ color: RED }}>{error}</p>}
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
            <SortTh col="num" label="#" sort={sort} onSort={clickSort} />
            <SortTh col="met_on" label="Date" sort={sort} onSort={clickSort} />
            <SortTh col="note" label="Description" grow sort={sort} onSort={clickSort} />
            <SortTh col="payment" label="Status" sort={sort} onSort={clickSort} />
            {!readOnly && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) =>
            !readOnly && editing === m.id ? (
              <tr key={m.id} style={{ borderBottom: "1px solid var(--border-strong)" }}>
                <td className="py-1.5 pr-3">
                  <input
                    value={draft.num}
                    onChange={(e) => setDraft((d) => ({ ...d, num: e.target.value.replace(/[^0-9]/g, "") }))}
                    inputMode="numeric"
                    className="w-12 px-1.5 py-1 rounded-lg text-sm text-center outline-none"
                    style={{ ...editInput, fontFamily: "'Courier New', monospace" }}
                    aria-label="Meeting number"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <DatePicker
                    value={draft.met_on}
                    onChange={(iso) => setDraft((d) => ({ ...d, met_on: iso }))}
                    ariaLabel="Meeting date"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    value={draft.note}
                    onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(m)}
                    placeholder="What was covered"
                    maxLength={200}
                    className="w-full min-w-32 px-2 py-1 rounded-lg text-xs outline-none"
                    style={editInput}
                    aria-label="Meeting description"
                  />
                </td>
                <td className="py-1.5 pr-3" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => saveEdit(m)}
                      className="text-[11px] font-bold px-2 py-1 rounded-md hover:brightness-125 transition"
                      style={{ color: GREEN, background: `${GREEN}18` }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition"
                      style={{ color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
                    >
                      Cancel
                    </button>
                  </span>
                </td>
              </tr>
            ) : (
              <tr
                key={m.id}
                draggable={canDrag}
                onDragStart={() => setDragId(m.id)}
                onDragOver={(e) => { if (canDrag && dragId) { e.preventDefault(); setOverId(m.id); } }}
                onDrop={(e) => { e.preventDefault(); drop(m.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                style={{
                  borderBottom: "1px solid var(--border-strong)",
                  cursor: canDrag ? "grab" : undefined,
                  opacity: dragId === m.id ? 0.4 : 1,
                  background: overId === m.id && dragId && dragId !== m.id ? `${GREEN}14` : undefined,
                }}
              >
                <td className="py-2 pr-3 font-bold whitespace-nowrap" style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
                  <span className="inline-flex items-center gap-1.5">
                    {canDrag && (
                      <GripVertical
                        size={12}
                        strokeWidth={2.5}
                        style={{ color: "var(--text-disabled)" }}
                        aria-hidden="true"
                      />
                    )}
                    #{m.num}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {formatMetDate(m.met_on)}
                </td>
                <td className="py-2 pr-3 text-xs" style={{ color: m.note ? "var(--text)" : "var(--text-disabled)" }}>
                  {m.note || "—"}
                </td>
                <td className="py-2 pr-3">
                  {readOnly ? (
                    <span
                      className="text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap"
                      style={{ color: PAYMENT_COLORS[m.payment], background: `color-mix(in srgb, ${PAYMENT_COLORS[m.payment]} 12%, transparent)` }}
                    >
                      {PAYMENT_LABELS[m.payment]}
                    </span>
                  ) : (
                    <button
                      onClick={() => onCycle(m)}
                      className="text-[11px] font-bold px-2 py-1 rounded-md hover:brightness-125 transition whitespace-nowrap"
                      style={{ color: PAYMENT_COLORS[m.payment], background: `color-mix(in srgb, ${PAYMENT_COLORS[m.payment]} 12%, transparent)` }}
                      title="Click to change: Not paid, Paid, Cancelled"
                    >
                      {PAYMENT_LABELS[m.payment]}
                    </button>
                  )}
                </td>
                {!readOnly && (
                  <td className="py-2 whitespace-nowrap">
                    <button
                      onClick={() => startEdit(m)}
                      className="p-1 rounded hover:brightness-125 transition"
                      style={{ color: "var(--text-muted)" }}
                      title={`Edit meeting ${m.num}`}
                    >
                      <Pencil size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => onDelete(m)}
                      className="p-1 rounded hover:brightness-125 transition"
                      style={{ color: "var(--text-muted)" }}
                      title={`Remove meeting ${m.num}`}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One student's meeting book, on their detail page. Numbers are explicit
 * because the teacher's history predates the app: the first row logged here
 * can be meeting 12, and the next offer is then 13. The table handles sorting
 * and editing; this owns the data and the log row.
 */
function StudentMeetings({ classId, studentId }) {
  const [meets, setMeets] = useState(null);
  const [numOverride, setNumOverride] = useState("");
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await studentMeetings(classId, studentId);
        if (!cancelled) setMeets(fetched);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Could not load the meetings.");
          setMeets([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, studentId]);

  const reload = async () => setMeets(await studentMeetings(classId, studentId).catch(() => []));

  // Live: the same book open on another screen (the student's, or the teacher
  // on a second device) follows every log, edit, chip and delete.
  useEffect(
    () =>
      watchTables(`book-${classId}-${studentId}`, [{ table: "meetings", filter: `class_id=eq.${classId}` }], () =>
        studentMeetings(classId, studentId).then(setMeets).catch(() => {})
      ),
    [classId, studentId]
  );

  // Cleared by typing in the box, refilled from the book: max + 1, so a book
  // that starts at 12 offers 13 next.
  const offered = numOverride !== "" ? numOverride : String(nextMeetingNumber(meets || []));

  const log = async () => {
    const n = parseInt(offered, 10);
    if (!Number.isFinite(n) || n < 1 || busy) return;
    setBusy(true);
    try {
      setError(null);
      await logMeeting(classId, studentId, n, newNote);
      await reload();
      setNumOverride("");
      setNewNote("");
    } catch (e) {
      setError(e.code === "23505" ? `Meeting ${n} is already in this student's book.` : e.message || "Could not log the meeting.");
    } finally {
      setBusy(false);
    }
  };

  const cycle = async (m) => {
    const next = cyclePayment(m.payment);
    // Optimistic: the chip is clicked in rhythm, and a round trip per click
    // would make it feel stuck. A failure reloads the truth.
    setMeets((prev) => prev.map((x) => (x.id === m.id ? { ...x, payment: next } : x)));
    try {
      await setMeetingPayment(m.id, next);
    } catch {
      await reload();
    }
  };

  const removeMeet = async (m) => {
    setMeets((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await deleteMeeting(m.id);
    } catch {
      await reload();
    }
  };

  const applyEdit = async (m, patch) => {
    await updateMeeting(m.id, patch);
    await reload();
  };

  /**
   * `ordered` is the whole book in the sequence it should now read, lowest
   * number first. Applied on screen straight away — a row that snaps back
   * under the cursor while a round trip finishes feels broken — then written
   * in one transaction, and re-read from the server if that fails.
   */
  const reorder = async (ordered) => {
    const plan = renumberPlan(ordered);
    if (!plan.length) return;
    const byId = new Map(plan.map((p) => [p.id, p.num]));
    setMeets((prev) => prev.map((m) => (byId.has(m.id) ? { ...m, num: byId.get(m.id) } : m)));
    try {
      setError(null);
      await reorderMeetings(ordered.map((m) => m.id));
    } catch (e) {
      setError(e.message || "Could not save the new order.");
      await reload();
    }
  };

  // Only worth offering when it would actually change something.
  const dateOrdered = byDate(meets || []);
  const canSortByDate = (meets || []).length > 1 && !isSequential(dateOrdered);

  const summaryLine = meets && meets.length > 0 ? paymentSummary(meets) : null;

  return (
    <>
      <Heading>MEETINGS</Heading>
      <div className="rounded-2xl p-4 mb-8" style={card}>
        {error && <p className="text-xs mb-2" style={{ color: RED }}>{error}</p>}

        {meets === null && (
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Loading the book...</div>
        )}

        {meets && meets.length > 0 && (
          <div className="mb-3">
            <MeetingsTable
              meets={meets}
              onCycle={cycle}
              onDelete={removeMeet}
              onUpdate={applyEdit}
              onReorder={reorder}
            />
            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Drag a row by its handle to reorder. The numbers follow.
              </span>
              <button
                onClick={() => reorder(dateOrdered)}
                disabled={!canSortByDate}
                className="text-[11px] px-2 py-1 rounded-md transition inline-flex items-center gap-1"
                style={{
                  color: canSortByDate ? GREEN : "var(--text-disabled)",
                  border: `1px solid ${canSortByDate ? `${GREEN}60` : "var(--border-strong)"}`,
                }}
                title={
                  canSortByDate
                    ? "Put the meetings in date order and renumber them"
                    : "Already in date order"
                }
              >
                <ArrowDownUp size={11} strokeWidth={2.5} /> Sort by date
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-3 flex-wrap" style={{ borderTop: "1px solid var(--border-strong)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Meet</span>
          <input
            value={offered}
            onChange={(e) => setNumOverride(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && log()}
            inputMode="numeric"
            className="w-14 px-2 py-1.5 rounded-lg text-sm text-center outline-none"
            style={{
              background: "var(--bg)",
              border: "1.5px solid var(--border-strong)",
              color: "var(--text)",
              fontFamily: "'Courier New', monospace",
            }}
            aria-label="Meeting number to log"
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && log()}
            placeholder="What was covered (optional)"
            maxLength={200}
            className="flex-1 min-w-32 px-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text)" }}
            aria-label="Meeting description"
          />
          <PixelButton onClick={log} size="sm" disabled={busy}>
            <Plus size={12} className="inline mr-1" /> Log it
          </PixelButton>
          {summaryLine && (
            <span className="text-[11px] w-full text-right" style={{ color: "var(--text-muted)" }}>
              {summaryLine}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * A class the account has joined, with their own meeting book folded inside,
 * read-only. Fetched lazily on first open: most visits to this page are the
 * teacher's, and the join list should not fire a query per class for them.
 */
function JoinedClassRow({ m, userId, onLeave }) {
  const [open, setOpen] = useState(false);
  const [meets, setMeets] = useState(null);

  useEffect(() => {
    if (!open || meets !== null) return undefined;
    let cancelled = false;
    studentMeetings(m.class_id, userId)
      .then((fetched) => { if (!cancelled) setMeets(fetched); })
      .catch(() => { if (!cancelled) setMeets([]); });
    return () => {
      cancelled = true;
    };
  }, [open, meets, m.class_id, userId]);

  // Live: the teacher logging or editing a meeting lands in the student's
  // table while they are looking at it. Only once opened; a closed row has
  // nothing to refresh and re-fetches on its first open anyway.
  useEffect(() => {
    if (!open) return undefined;
    return watchTables(`joined-${m.class_id}-${userId}`, [{ table: "meetings", filter: `class_id=eq.${m.class_id}` }], () =>
      studentMeetings(m.class_id, userId).then(setMeets).catch(() => {})
    );
  }, [open, m.class_id, userId]);

  const link = m.classes?.meet_link;

  return (
    <div className="rounded-xl p-4" style={card}>
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: "var(--text)" }}>
            {m.classes?.name || "A class"}
            {open ? (
              <ChevronUp size={13} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
            ) : (
              <ChevronDown size={13} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            You appear as {m.display_name}
          </div>
        </button>
        {link && (
          <a
            href={linkHref(link)}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 p-1.5 rounded-md hover:brightness-125 transition"
            style={{ color: GREEN, border: `1px solid ${GREEN}60` }}
            title="Open the meeting link"
          >
            <Video size={13} strokeWidth={2.5} />
          </a>
        )}
        <button
          onClick={onLeave}
          className="text-[11px] px-2 py-1 rounded-md hover:brightness-125 transition flex-shrink-0"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
        >
          Leave
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-strong)" }}>
          {meets === null && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Loading your meetings...</div>
          )}
          {meets && meets.length === 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>No meetings logged yet.</div>
          )}
          {meets && meets.length > 0 && <MeetingsTable meets={meets} readOnly />}
        </div>
      )}
    </div>
  );
}

function Roster({ klass, studentId, onBack }) {
  const navigate = useNavigate();
  // The raw view rows are kept, not just the derived register lines: the
  // per-student page needs the progress and practice blobs themselves.
  // `studentId` comes from the URL (/classes/:classId/:studentId), so the
  // register and each student's page are real places the back button knows.
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  // The whole class's meeting book, for the one-line tally under each student.
  // The per-student page fetches its own copy; this refreshes on the way back.
  const [book, setBook] = useState([]);
  const loadBook = useCallback(async () => {
    try {
      setBook(await meetings(klass.id));
    } catch {
      // The tallies are a convenience; the register keeps working without them.
    }
  }, [klass.id]);
  useEffect(() => {
    let cancelled = false;
    meetings(klass.id)
      .then((fetched) => { if (!cancelled) setBook(fetched); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [klass.id]);
  const bookByStudent = useMemo(() => {
    const map = {};
    for (const m of book) (map[m.student_id] ??= []).push(m);
    return map;
  }, [book]);

  // Live: someone joining or leaving, or any meeting logged, edited or
  // removed in this class, refreshes the register for whoever has it open.
  useEffect(
    () =>
      watchTables(
        `register-${klass.id}`,
        [
          { table: "class_members", filter: `class_id=eq.${klass.id}` },
          { table: "meetings", filter: `class_id=eq.${klass.id}` },
        ],
        (table) => (table === "meetings" ? loadBook() : load())
      ),
    [klass.id, load, loadBook]
  );

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
  // removal or a reload cannot leave the detail showing a stale copy. A
  // student id in the URL for someone no longer in the class falls through to
  // the register rather than a dead end.
  const openMember = studentId && (members || []).find((m) => m.student_id === studentId);
  if (openMember) {
    return (
      <StudentDetail
        detail={studentDetail(TRACKS, openMember)}
        classId={klass.id}
        studentId={openMember.student_id}
        onBack={() => {
          navigate(`/classes/${klass.id}`);
          // The register's per-row tallies show what the book now says.
          loadBook();
        }}
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
              : { color: "var(--text-muted)", border: "1px solid var(--border-strong)" }
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

      <MeetLinkRow klass={klass} />

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
            <StudentRow
              row={row}
              book={bookByStudent[row.studentId] || []}
              onOpen={(r) => navigate(`/classes/${klass.id}/${r.studentId}`)}
              onRemove={remove}
            />
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
  // The class and student come from the URL (/classes, /classes/:classId,
  // /classes/:classId/:studentId), so refresh, back and a shared link all land
  // where they should instead of resetting to the flat list.
  const { classId, studentId } = useParams();

  // null means the fetch is still in flight, so the lists render as skeleton
  // cards rather than a silent gap. Errors settle them to [] so the skeleton
  // cannot shimmer forever next to the error note.
  const [taught, setTaught] = useState(null);
  const [joined, setJoined] = useState(null);
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

  // Live: a class created, closed, renamed or joined anywhere shows up here
  // without a reload. Both lists come from these two tables.
  useEffect(() => {
    if (!user) return undefined;
    return watchTables(`classes-${user.id}`, [{ table: "classes" }, { table: "class_members" }], () => load());
  }, [user, load]);

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

  // Defaults to the account's display name (see src/lib/profile.js), which is
  // what the rest of the app already shows, while letting them change it: the
  // teacher's register should say what the student wants to be called. Derived
  // rather than an effect, so clearing the box leaves it cleared instead of
  // refilling itself.
  const studentName = nameOverride ?? displayNameOf(user);

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

  // Derived from the URL rather than held in state. While the class list is
  // still loading, a classId in the URL shows the register skeleton instead of
  // flashing the flat list; a classId that never resolves (deleted, or not
  // this teacher's) falls back to the list.
  const open = classId ? (taught ?? []).find((k) => k.id === classId) : null;
  const classPending = classId && taught === null;

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-3xl mx-auto">
        {classPending ? (
          <RosterSkeleton />
        ) : open ? (
          <Roster klass={open} studentId={studentId} onBack={() => { navigate("/classes"); load(); }} />
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
                    <button onClick={() => navigate(`/classes/${k.id}`)} className="min-w-0 flex-1 text-left">
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
                      style={{ color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}
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
                  style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text)" }}
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
                  <JoinedClassRow
                    key={m.class_id}
                    m={m}
                    userId={user.id}
                    onLeave={async () => {
                      try {
                        await leaveClass(m.class_id, user.id);
                        await load();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  />
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
                      border: "1.5px solid var(--border-strong)",
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
                    style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text)" }}
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
