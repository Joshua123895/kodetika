// Supabase access for the classroom. See supabase/001_classes.sql for the
// tables, the policies and the join function these call.
//
// Everything here needs a signed-in user; there is no localStorage fallback the
// way progress has one. A class is inherently shared, so an offline copy would
// be a copy of nothing.

import { supabase } from "./supabase";

// No O/0 or I/1: the code gets read off a projector and typed by thirty people.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** A join code. Uniqueness is the database's job; collisions retry on insert. */
export function makeJoinCode(random = Math.random) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Normalises what somebody typed: upper case, and nothing that is not a letter
 * or a digit, so "abc 123" and "ABC-123" both work.
 *
 * Deliberately does NOT try to fix O/0 or I/1. The generator excludes all four
 * characters, so a code can never contain one; somebody who typed an O has
 * misread something else (a Q, most likely) and guessing which would turn a
 * clear "no class with that code" into a join with the wrong class.
 */
export function normaliseCode(input = "") {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

function need() {
  if (!supabase) throw new Error("Not configured for the cloud.");
}

/**
 * Creates a class and returns it.
 *
 * Retries on a duplicate code rather than checking first: the unique index is
 * the only check that cannot race, and 32^6 codes means this practically never
 * runs twice.
 */
export async function createClass(name, teacherId, attempts = 5) {
  need();
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from("classes")
      .insert({ name: name.trim(), teacher_id: teacherId, join_code: makeJoinCode() })
      .select()
      .single();
    if (!error) return data;
    // 23505 is unique_violation; anything else is a real failure.
    if (error.code !== "23505") throw error;
    lastError = error;
  }
  throw lastError;
}

export async function myClasses(teacherId) {
  need();
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * The classes this account has joined as a student.
 *
 * The student_id filter is not redundant with RLS. Policies are permissive and
 * OR together, so a teacher reading this table matches "students see and leave
 * their own membership" for their own rows AND "teachers see their own roster"
 * for every student in their classes. Without the filter a teacher's own
 * learning list fills up with their students, each labelled as if it were them.
 */
export async function myMemberships(studentId) {
  need();
  const { data, error } = await supabase
    .from("class_members")
    .select("class_id, display_name, joined_at, classes(id, name, archived)")
    .eq("student_id", studentId)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** The register. Reads the view, which is the only thing a teacher may select. */
export async function roster(classId) {
  need();
  const { data, error } = await supabase
    .from("class_progress")
    .select("*")
    .eq("class_id", classId);
  if (error) throw error;
  return data || [];
}

export async function joinClass(code, displayName) {
  need();
  const { data, error } = await supabase.rpc("join_class", {
    code: normaliseCode(code),
    display_name: displayName.trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function leaveClass(classId, studentId) {
  need();
  const { error } = await supabase
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) throw error;
}

/**
 * Deletes a class outright. The teacher's "for all" policy covers the delete
 * and class_members cascades, so the roster goes with it. Students lose the
 * membership row only; their progress is theirs and is untouched.
 */
export async function deleteClass(classId) {
  need();
  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) throw error;
}

export async function setArchived(classId, archived) {
  need();
  const { error } = await supabase.from("classes").update({ archived }).eq("id", classId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The meeting logbook. Teacher-only end to end: the policies in
// supabase/002_meetings.sql give students no read on this table at all,
// because payment standing is the teacher's book, not the student's page.
// ---------------------------------------------------------------------------

/** Saves the class's meeting link; empty clears it. */
export async function setMeetLink(classId, link) {
  need();
  const trimmed = (link || "").trim();
  const { error } = await supabase
    .from("classes")
    .update({ meet_link: trimmed || null })
    .eq("id", classId);
  if (error) throw error;
  return trimmed || null;
}

/** Every meeting in the class, for the register's per-student tallies. */
export async function meetings(classId) {
  need();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("class_id", classId)
    .order("num", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** One student's book, newest first. */
export async function studentMeetings(classId, studentId) {
  need();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .order("num", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Today as the teacher's own calendar sees it, not the server's UTC one. */
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Logs one meeting. `num` is explicit: the teacher's history may start at 12.
 * The date is sent from the client rather than left to the column default,
 * because `current_date` on the server is UTC and an evening meeting in
 * Jakarta would otherwise be logged under yesterday.
 */
export async function logMeeting(classId, studentId, num) {
  need();
  const { data, error } = await supabase
    .from("meetings")
    .insert({ class_id: classId, student_id: studentId, num, met_on: localDate() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Edits one meeting's number and date, the teacher correcting their book. */
export async function updateMeeting(id, { num, met_on }) {
  need();
  const { error } = await supabase.from("meetings").update({ num, met_on }).eq("id", id);
  if (error) throw error;
}

export async function setMeetingPayment(id, payment) {
  need();
  const { error } = await supabase.from("meetings").update({ payment }).eq("id", id);
  if (error) throw error;
}

export async function deleteMeeting(id) {
  need();
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) throw error;
}
