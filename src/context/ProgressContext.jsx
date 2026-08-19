import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { loadCodes, mergeSavedCodes, writeAllCodes, registerCloudSaver } from "../lib/savedCode";
import { loadScores, mergeScores, writeAllScores, registerArcadeCloudSaver } from "../lib/arcadeScores";
import {
  loadPractice,
  mergePractice,
  writeAllPractice,
  registerPracticeCloudSaver,
  recordActivity,
  recordLevelResult,
  LEVEL_POINTS,
} from "../lib/practice";
import { play } from "../lib/sound";
import { buildNotice } from "../lib/notice";
import { adoptLegacyKey } from "../lib/legacyStorage";

const STORAGE_KEY = "kodetika_progress";
adoptLegacyKey(STORAGE_KEY, "step-into-code_progress");

// ---- localStorage (the offline / logged-out source of truth) ----------------

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    const migrated = {};
    for (const slug of Object.keys(raw)) {
      if (Array.isArray(raw[slug])) {
        // Legacy shape: an array of completed ids, all treated as 3 stars.
        const map = {};
        for (const id of raw[slug]) map[id] = 3;
        migrated[slug] = map;
      } else {
        migrated[slug] = raw[slug] || {};
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---- merge: keep the BEST result per level so nothing is ever downgraded -----
// Used both when reconciling cloud vs local on login and when a second device
// has independently made progress. Highest star count always wins.
function mergeProgress(a = {}, b = {}) {
  const out = {};
  for (const src of [a, b]) {
    for (const slug of Object.keys(src)) {
      out[slug] = out[slug] || {};
      for (const levelId of Object.keys(src[slug])) {
        const prev = out[slug][levelId] || 0;
        out[slug][levelId] = Math.max(prev, src[slug][levelId] || 0);
      }
    }
  }
  return out;
}

// ---- cloud (Supabase) -------------------------------------------------------

async function fetchCloud(userId) {
  const { data, error } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? {};
}

async function pushCloud(userId, data) {
  const { error } = await supabase
    .from("progress")
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function fetchCloudCodes(userId) {
  const { data, error } = await supabase
    .from("progress")
    .select("saved_code")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.saved_code ?? {};
}

// Upserts only the saved_code column, so it never clobbers `data` (an upsert
// updates just the columns it's given on an existing row).
async function pushCloudCodes(userId, savedCode) {
  const { error } = await supabase
    .from("progress")
    .upsert({ user_id: userId, saved_code: savedCode, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function fetchCloudScores(userId) {
  const { data, error } = await supabase
    .from("progress")
    .select("arcade")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.arcade ?? {};
}

// Column-scoped upsert again: writing `arcade` leaves `data` and `saved_code`
// untouched on an existing row.
async function pushCloudScores(userId, arcade) {
  const { error } = await supabase
    .from("progress")
    .upsert({ user_id: userId, arcade, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function fetchCloudPractice(userId) {
  const { data, error } = await supabase
    .from("progress")
    .select("practice")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.practice ?? {};
}

async function pushCloudPractice(userId, practice) {
  const { error } = await supabase
    .from("progress")
    .upsert({ user_id: userId, practice, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const ProgressContext = createContext(null);

export function ProgressProvider({ children }) {
  const { user } = useAuth();
  const { dailyGoal } = useSettings();
  const [progress, setProgress] = useState(load);
  // Bumped after the login-merge writes cloud saved code into localStorage, so
  // an open LevelPage can pull the freshly-synced code into its editor.
  const [codeSyncTick, setCodeSyncTick] = useState(0);
  // What the last completed level did to the streak and the review queue, for
  // CompletionModal to show. Set in the same handler that opens the modal, so
  // it is already in place by the time the modal first renders.
  const [lastNotice, setLastNotice] = useState(null);
  const noticeSeq = useRef(0);

  const userId = user?.id ?? null;

  // On login: pull the cloud copies of BOTH progress and saved code, merge each
  // with whatever this device has, then push the merged results back so both
  // sides converge. Progress keeps the best stars; saved code lets this device's
  // work win on conflict.
  useEffect(() => {
    if (!userId || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const cloud = await fetchCloud(userId);
        const merged = mergeProgress(cloud, load());
        if (cancelled) return;
        setProgress(merged);
        save(merged);
        await pushCloud(userId, merged);
      } catch {
        // Offline or misconfigured: stay on local progress, no crash.
      }
      try {
        const cloudCodes = await fetchCloudCodes(userId);
        const mergedCodes = mergeSavedCodes(cloudCodes, loadCodes());
        if (cancelled) return;
        writeAllCodes(mergedCodes);
        setCodeSyncTick((t) => t + 1);
        await pushCloudCodes(userId, mergedCodes);
      } catch {
        // Saved-code sync is best-effort; local code still works.
      }
      try {
        const cloudScores = await fetchCloudScores(userId);
        const mergedScores = mergeScores(cloudScores, loadScores());
        if (cancelled) return;
        writeAllScores(mergedScores);
        await pushCloudScores(userId, mergedScores);
      } catch {
        // Arcade scores are the least important thing here; never block login.
      }
      try {
        const cloudPractice = await fetchCloudPractice(userId);
        const mergedPractice = mergePractice(cloudPractice, loadPractice());
        if (cancelled) return;
        writeAllPractice(mergedPractice);
        await pushCloudPractice(userId, mergedPractice);
      } catch {
        // Isolated on purpose. Until the `practice` column exists on the
        // progress table this whole block throws, and it must take nothing with
        // it: streaks and the review queue keep working from localStorage, they
        // simply do not follow you to another device yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // While logged in, let saveCode/clearSavedCode push to the cloud (debounced).
  useEffect(() => {
    if (!userId || !supabase) {
      registerCloudSaver(null);
      registerArcadeCloudSaver(null);
      registerPracticeCloudSaver(null);
      return;
    }
    registerArcadeCloudSaver((scores) => pushCloudScores(userId, scores).catch(() => {}));
    registerPracticeCloudSaver((practice) => pushCloudPractice(userId, practice).catch(() => {}));
    registerCloudSaver((codes) => pushCloudCodes(userId, codes).catch(() => {}));
    return () => {
      registerCloudSaver(null);
      registerPracticeCloudSaver(null);
    };
  }, [userId]);

  // Every grading path in LevelPage funnels through here — python, web, sql,
  // backend and game all call it — so the streak and the review schedule are
  // recorded in this one place rather than at five call sites where a new
  // runtime could quietly forget to.
  //
  // The daily target is read from SettingsContext rather than passed in.
  // main.jsx nests SettingsProvider outside ProgressProvider, so it is simply
  // in scope, and the five call sites stay exactly as they were.
  const completeLevel = useCallback(
    (trackSlug, levelId, stars) => {
      setProgress((prev) => {
        const track = { ...(prev[trackSlug] || {}) };
        // Never downgrade a level the student already did better on.
        track[levelId] = Math.max(track[levelId] || 0, stars);
        const next = { ...prev, [trackSlug]: track };
        save(next);
        if (userId && supabase) pushCloud(userId, next).catch(() => {});
        return next;
      });

      // Deliberately outside the state updater: React may call that twice in
      // StrictMode, and a streak that counted a level twice would be a bug
      // nobody could reproduce.
      const review = recordLevelResult(trackSlug, levelId, stars);
      const day = recordActivity({ points: LEVEL_POINTS, goal: dailyGoal });

      // Published rather than floated. A level completion opens the stars modal
      // in the same tick, and a toast in the dock lands on top of it: on a phone
      // it covers the "Quest Complete!" heading, on a desktop it covers the
      // stars themselves. CompletionModal renders this inline instead.
      //
      // `seq` makes each result distinct even when two are identical, so the
      // modal's progress bar re-runs its animation rather than deciding nothing
      // changed. One celebratory sound at most, ranked by buildNotice.
      const notice = buildNotice(day, review);
      if (notice.sound) play(notice.sound);
      setLastNotice({ ...notice, seq: noticeSeq.current++ });
    },
    [userId, dailyGoal],
  );

  // Admin-only (see src/lib/admin.js): erase progress for one track, or for
  // everything when `trackSlug` is omitted.
  //
  // The cloud write is awaited and its failure is rethrown, because a reset that
  // only cleared localStorage would look like it worked and then be undone on the
  // next login — mergeProgress keeps the best of cloud and local, so the cloud
  // copy would simply put every star back.
  const resetProgress = useCallback(
    async (trackSlug) => {
      const next = trackSlug
        ? Object.fromEntries(Object.entries(progress).filter(([slug]) => slug !== trackSlug))
        : {};
      setProgress(next);
      save(next);
      if (userId && supabase) await pushCloud(userId, next);
    },
    [progress, userId],
  );

  const getStars = useCallback(
    (trackSlug, levelId) => (progress[trackSlug] || {})[levelId] || 0,
    [progress],
  );

  const getLevelStatus = useCallback(
    (trackSlug, levelId) => ((progress[trackSlug] || {})[levelId] ? "completed" : "unlocked"),
    [progress],
  );

  const getCompletedCount = useCallback(
    (trackSlug) => Object.keys(progress[trackSlug] || {}).length,
    [progress],
  );

  const getTotalStars = useCallback(
    (trackSlug) =>
      Object.values(progress[trackSlug] || {}).reduce((sum, s) => sum + s, 0),
    [progress],
  );

  const getTrackProgress = useCallback(
    (trackSlug, totalLevels) => {
      const done = Object.keys(progress[trackSlug] || {}).length;
      if (!totalLevels) return 0;
      return Math.round((done / totalLevels) * 100);
    },
    [progress],
  );

  const value = {
    progress,
    completeLevel,
    resetProgress,
    getStars,
    getLevelStatus,
    getCompletedCount,
    getTotalStars,
    getTrackProgress,
    lastNotice,
    codeSyncTick,
  };

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within a ProgressProvider");
  return ctx;
}
