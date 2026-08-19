import { Activity, ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Compass, FlaskConical, Globe, LayoutList, Lightbulb, Lock, Play, Star, Target } from "lucide-react";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TRACKS, DIFFICULTY } from "../data/tracks";
import { runnableSource, withDriver, splitProbe } from "../data/levelSource";
import { useProgress, saveCode, getSavedCode, clearSavedCode } from "../hooks/useProgress";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { isChapterUnlocked, blockingChapterName } from "../utils/chapterLock";

import { runPythonReal, runPythonRealBatch } from "../utils/pythonRunnerReal";
import { mergeFileStore } from "../utils/fileManager";
import { validateStructure } from "../utils/structureValidator";
import { norm, matchOutput, checkOutput } from "../utils/outputMatcher";
import { warmPyodideWorker } from "../utils/pyodideWorkerClient";
import { runWebLevel } from "../web/webRuntime";
import WebPreview from "../web/WebPreview";
import { runSql, warmSqlWorker } from "../sql/sqlClient";
import { gradeSql, wantsOrder } from "../sql/sqlCore";
import SqlResult from "../sql/SqlResult";
import BackendPreview from "../backend/BackendPreview";
import { isFullstackLevel, pageFrom } from "../backend/fullstack";
import { fetchShimScript, routeTable } from "../backend/fetchShim";
import CompletionModal from "../components/CompletionModal";
import { getVisualization } from "../visualizations";
import CodeEditorContainer from "../components/CodeEditorContainer";
import { useColors } from "../editor/colors";
import GameModal from "../game/GameModal";
import Companion from "../components/Companion";
import ProgressBar from "../components/ProgressBar";
import PixelButton from "../components/PixelButton";
import Icon from "../components/Icon";
import RichText from "../components/RichText";
import StarIcon from "../components/StarIcon";
import completeSound from "../assets/sounds/complete.mp3";
import collectSound from "../assets/sounds/collect.mp3";
import wrongSound from "../assets/sounds/wrong.mp3";

export default function LevelPage() {
  const { trackName, chapterId, levelId } = useParams();

  const DEV = import.meta.env.DEV;
  function debugFail(label, info) { if (DEV) console.debug(`[validation] ${label}`, info); }
  function diffStrings(a, b) {
    if (!DEV) return null;
    const na = (a || "").replace(/\r\n/g, "\n"), nb = (b || "").replace(/\r\n/g, "\n");
    if (na === nb) return null;
    const la = na.split("\n"), lb = nb.split("\n");
    const diffs = [];
    const max = Math.max(la.length, lb.length);
    for (let i = 0; i < max; i++) {
      if (la[i] !== lb[i]) diffs.push({ line: i + 1, expected: JSON.stringify(la[i] ?? "(missing)"), actual: JSON.stringify(lb[i] ?? "(missing)") });
    }
    return diffs.length ? diffs : { expectedLen: na.length, actualLen: nb.length, expectedBytes: [...na].map(c => c.charCodeAt(0)), actualBytes: [...nb].map(c => c.charCodeAt(0)) };
  }

  const audioContextRef = useRef(null);
  const completeBufferRef = useRef(null);
  const collectBufferRef = useRef(null);
  const wrongBufferRef = useRef(null);

  useEffect(() => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const loadSound = (url, bufferRef) => {
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { bufferRef.current = buf; })
        .catch(() => {});
    };

    loadSound(completeSound, completeBufferRef);
    loadSound(collectSound, collectBufferRef);
    loadSound(wrongSound, wrongBufferRef);

    return () => {
      ctx.close();
    };
  }, []);

  function playSound(buffer) {
    const ctx = audioContextRef.current;
    if (!ctx || !buffer) return;
    if (ctx.state === "suspended") ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  function playCompleteSound(stars) { playSound(stars === 3 ? completeBufferRef.current : collectBufferRef.current); }
  function playWrongSound() { playSound(wrongBufferRef.current); }

  async function cachedRunPythonReal(code, initialFiles, trackedFiles, inputs) {
    const normalizedFiles = Object.keys(initialFiles).sort().reduce((acc, key) => {
      acc[key] = initialFiles[key];
      return acc;
    }, {});
    const cacheKey = JSON.stringify({ c: code, f: normalizedFiles, t: trackedFiles, i: inputs });
    const cached = serverCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const result = await runPythonReal(code, initialFiles, trackedFiles, inputs);
    if (!result.error) {
      serverCacheRef.current.set(cacheKey, result);
    }
    return result;
  }

  const navigate = useNavigate();
  const c = useColors();
  const { getLevelStatus, getStars, completeLevel, getTotalStars, codeSyncTick, lastNotice } = useProgress();
  const { isAdmin } = useAuth();
  const { companion: companionOn, tone: companionTone } = useSettings();

  const track = TRACKS.find((t) => t.slug === trackName);
  const chapter = track?.chapters.find((c) => c.id === Number(chapterId));
  const level = chapter?.levels.find((l) => l.id === Number(levelId));
  const status = level ? getLevelStatus(trackName, level.id) : null;
  const diff = track ? (DIFFICULTY[track.difficulty] || DIFFICULTY[1]) : DIFFICULTY[1];

  // Shared by the completion modal's Continue button and its Alt+Right/Enter
  // keyboard equivalents below, so the two can never fall out of sync on
  // where "next" actually goes.
  const goToNextLevel = () => {
    const idx = chapter?.levels.findIndex((l) => l.id === level?.id) ?? -1;
    const nextLevel = idx >= 0 ? chapter.levels[idx + 1] : undefined;
    if (nextLevel) navigate(`/tracks/${trackName}/${chapterId}/${nextLevel.id}`);
    else navigate(`/tracks/${trackName}`);
  };

  const fileStore = useRef({});
  const [fileEntries, setFileEntries] = useState({});
  const [fileEntriesBefore, setFileEntriesBefore] = useState({});
  const serverCacheRef = useRef(new Map());
  const prevLevelIdRef = useRef(null);
  const solutionCacheRef = useRef(null);
  const [initialFileSnapshot, setInitialFileSnapshot] = useState(null);

  useEffect(() => {
    // The warm-up lives in App.jsx now, so it starts on ANY route rather than
    // only once the student has already opened a level. It also had to move
    // because the call here warmed ensurePyodide() from utils/pyodide.js — the
    // main-thread interpreter used only for AST checks — while Run/Submit
    // execute in a completely separate Pyodide inside the worker. It never
    // warmed the runtime it was meant to, and made anyone who ran code download
    // the runtime twice.
    warmPyodideWorker().catch(() => {});
  }, []);

  // SQLite is fetched only on the track that needs it, and only once. Starting
  // it here rather than on the first Run keeps the ~1.2MB download off the
  // student's clock — execTime feeds the speed star, and a cold engine billed to
  // their first submission would cost them a star on a correct answer.
  useEffect(() => {
    if (level?.sql) warmSqlWorker().catch(() => {});
  }, [level]);

  useEffect(() => {
    solutionCacheRef.current = null;
    if (level?.files) {
      const initialFiles = level.files.initial || {};
      const trackedFiles = level.files.track || [];
      const fullSolution = runnableSource(trackName, level);
      runPythonReal(fullSolution, initialFiles, trackedFiles, [])
        .then((result) => {
          solutionCacheRef.current = {
            stdout: result.stdout || "",
            files: result.files || {},
          };
        })
        .catch(() => {});
    }
  }, [level, trackName]);

  function syncFileStore() {
    setFileEntries({ ...fileStore.current });
  }

  // `seedFromLevel` picks which filesystem the run starts from. The Run button
  // deliberately carries files over between runs so the editor behaves like a
  // real disk — append really appends. Grading must NOT inherit that: a student
  // who hits Run twice on an append level would otherwise be judged against a
  // file their own earlier run had already grown, and fail a correct answer.
  // Submissions therefore always start from the level's pristine seed.
  async function runWithFiles(rawCode, inputs, { seedFromLevel = false } = {}) {
    let result;
    if (level?.files) {
      const seed = seedFromLevel
        ? (level.files.initial ? { ...level.files.initial } : {})
        : fileStore.current;
      result = await cachedRunPythonReal(rawCode, seed, level.files.track || [], inputs || []);
      if (result.files && Object.keys(result.files).length > 0) {
        fileStore.current = mergeFileStore(fileStore.current, null, result.files);
        syncFileStore();
      }
    } else {
      result = await runPythonReal(rawCode, {}, [], inputs || []);
    }
    if (DEV) {
      console.debug("[runner] source=%s codeLen=%d stdoutLen=%d error=%s",
        result.source, rawCode.length, (result.stdout || "").length, result.error ?? "none");
    }
    if (!result.stdout && result.error) {
      // Surface runner failures instead of a blank "actual" in the failure UI.
      return `[runner error] ${result.error}`;
    }
    return result.stdout || "";
  }

  async function runCodeFrom(rawCode, initialFiles, inputs) {
    if (level?.files) {
      return await cachedRunPythonReal(rawCode, initialFiles, level.files.track || [], inputs || []);
    }
    return await runPythonReal(rawCode, initialFiles || {}, [], inputs || []);
  }


  const [code, setCode] = useState(level?.startingCode ?? "");
  const [showModal, setShowModal] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  // Bumped by Run on a web level. The preview already follows the editor on its
  // own, so Run means "reload the page" — which is the one thing the debounce
  // cannot give you, and the only way to re-run a script that has already run.
  const [previewNonce, setPreviewNonce] = useState(0);
  // Which aside tab is open. LevelPage is keyed by levelId in App.jsx, so this
  // resets to the description whenever the student moves to another level.
  const [activeTab, setActiveTab] = useState("description");
  // Hovering an inactive tab slides its label open, so the icons are never a
  // mystery you have to click to identify.
  const [hoveredTab, setHoveredTab] = useState(null);
  const [earnedStars, setEarnedStars] = useState(0);
  // The last thing the student's SQL produced — a grid, or the error SQLite gave
  // back. Held here rather than inside the pane so Submit can fill it too: on a
  // failed submission the result they got sits beside the reason it was wrong.
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  // What the student's app answered on the last Run, for the `browser` tab.
  // `undefined` means it has not been run yet; `null` means the program stopped
  // before the driver could ask it anything.
  const [responses, setResponses] = useState(undefined);
  // Which response the browser tab is showing, owned here because navigating
  // appends to the list and has to select what it just fetched.
  const [selected, setSelected] = useState(0);
  const [navBusy, setNavBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testFailure, setTestFailure] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);

  // Alt+Right / Alt+Left move between levels, Enter/Escape dismiss whichever
  // modal is open (the same action as clicking its backdrop) — reachable
  // without ever touching the mouse. Capture phase + stopPropagation so this
  // wins over CodeMirror's own Alt-ArrowLeft/Right binding (cursorSyntaxLeft/
  // Right, from @codemirror/commands) when the editor happens to have focus,
  // and so the keydown is never also handled a second time by CodeMirror.
  useEffect(() => {
    const onKeyDown = (event) => {
      // GameModal owns Escape itself while a game is open; don't fight it.
      if (gameOpen) return;

      if (event.key === "Enter" || event.key === "Escape") {
        if (testFailure) {
          event.preventDefault();
          event.stopPropagation();
          setTestFailure(null);
        } else if (showModal) {
          event.preventDefault();
          event.stopPropagation();
          setShowModal(false);
          goToNextLevel();
        }
        return;
      }

      if (!event.altKey || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
      if (!chapter || !level || testFailure || showModal) return;

      const idx = chapter.levels.findIndex((l) => l.id === level.id);
      if (event.key === "ArrowRight" && idx < chapter.levels.length - 1) {
        event.preventDefault();
        event.stopPropagation();
        navigate(`/tracks/${trackName}/${chapterId}/${chapter.levels[idx + 1].id}`);
      } else if (event.key === "ArrowLeft" && idx > 0) {
        event.preventDefault();
        event.stopPropagation();
        navigate(`/tracks/${trackName}/${chapterId}/${chapter.levels[idx - 1].id}`);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // goToNextLevel is a plain function closing over the same chapter/level/
    // trackName/chapterId/navigate already listed below, so it's already
    // current whenever this effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOpen, testFailure, showModal, chapter, level, trackName, chapterId, navigate]);

  useEffect(() => {
    if (!level) return;
    if (prevLevelIdRef.current !== levelId) {
      prevLevelIdRef.current = levelId;
      const defaultCode = level.startingCode ?? "";
      const stars = getStars(trackName, level.id);
      const saved = getSavedCode(trackName, level.id);
      // Coding levels reset to the pristine template once fully solved, so the
      // student can re-attempt cleanly. Game levels are the opposite: the edits
      // ARE the artifact (most of all on the free-build level), so their code is
      // always restored, completed or not.
      setCode(saved && (level.game || stars !== 3) ? saved : defaultCode);
      // A result grid belongs to the query that produced it. Carrying one across
      // levels would show the previous level's answer under the new question.
      setSqlResult(null);
      setResponses(undefined);
      setSelected(0);
      const initial = level.files?.initial ? { ...level.files.initial } : {};
      fileStore.current = initial;
      setInitialFileSnapshot({ ...initial });
      setFileEntries(initial);
    }
  }, [levelId, level, getStars, trackName]);

  useEffect(() => {
    if (trackName == null || level == null) return;
    // Don't autosave the pristine starting code. On a fresh device this effect
    // fires on mount and would otherwise clobber the code the cloud-sync is
    // still pulling in (local + cloud) with the empty template.
    if (code === (level.startingCode ?? "")) return;
    const timer = setTimeout(() => {
      saveCode(trackName, level.id, code);
    }, 500);
    return () => clearTimeout(timer);
  }, [code, level, trackName]);

  // When the login cloud-merge writes newly-synced saved code, pull it into the
  // editor — but only if the student hasn't started typing (editor still shows
  // the pristine template), so we never overwrite their in-progress work.
  useEffect(() => {
    if (!level || codeSyncTick === 0) return;
    const saved = getSavedCode(trackName, level.id);
    if (saved && (level.game || getStars(trackName, level.id) !== 3) && code === (level.startingCode ?? "")) {
      // Pulling in data delivered by an external system (the login cloud merge),
      // which is what effects are for — the tick is the only signal we get that
      // localStorage now holds newer code than the editor does.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeSyncTick]);

  const runInFlightRef = useRef(false);

  const handleRun = async () => {
    // Ref guard, not just `testing` state: two rapid clicks can both land
    // before React re-renders, so both would see testing === false.
    if (!level || runInFlightRef.current) return;
    runInFlightRef.current = true;
    try {
      await runChecks();
    } finally {
      runInFlightRef.current = false;
    }
  };

  // Grading for the web track. There is no stdout to compare, so correctness is
  // a list of statements about the rendered DOM (the level's `expect:` block)
  // rather than one expected string — which is also why the failure panel gets
  // sentences instead of an expected/actual diff.
  //
  // The stars are the same three every other track awards: pass, then line
  // budget, then speed. Speed is nearly free here (rendering a page is fast, and
  // nothing has to boot), so the third star is really the line budget's twin —
  // it stays for consistency rather than as a real challenge.
  // `web: true` means the editor holds a document; `web: js` means it holds a
  // script, which buildDocument wraps in a <script> tag for us. Without the
  // distinction a JavaScript level would have students typing `<script>` around
  // every answer, in an editor highlighting it as HTML.
  const isJsLevel = level?.web === "js";
  // A DOM level is a JavaScript level with a page to work on: `page:` supplies
  // the markup the student's script queries and changes. That markup is the
  // level's, not the student's, so it is not in the editor — which is the whole
  // point, since the skill being taught is reaching into a document you did not
  // write. The preview then shows the page rather than the console.
  const isDomLevel = isJsLevel && Boolean(level?.page);
  const webFiles = (source) =>
    isJsLevel ? { "index.html": level?.page ?? "", "script.js": source } : { "index.html": source };

  // SQL levels query a database rather than printing anything. The schema comes
  // from the track (one little database the whole track shares, so the student
  // learns it once) plus an optional per-level `seed:` for the few levels that
  // need a table of their own.
  const isSqlLevel = Boolean(level?.sql);
  const sqlSetup = (track?.db ?? "") + (level?.seed ? `\n${level.seed}` : "");

  // Backend levels: `req:` lists the requests the grader makes once the
  // student's routes exist. Run needs the same treatment as Submit, or pressing
  // Run on a page full of handlers prints nothing at all.
  const isBackendLevel = Array.isArray(level?.req) && level.req.length > 0;
  // Run also asks for the probe block, which Submit deliberately does not: the
  // graded program must stay exactly the program CI certified, so the extra
  // output exists only on the path nothing compares.
  const runWithRequests = (src) => withDriver(level, src, { probe: true });
  const takeProbe = useCallback((stdout) => {
    const { output, responses: seen } = splitProbe(stdout);
    setResponses(seen);
    setSelected(0);
    return output;
  }, []);

  // Typing a path into the browser tab's address bar. It runs the student's code
  // again with a `req:` list of its own, and keeps only the probe payload — the
  // console still belongs to the last Run, so exploring never disturbs the
  // transcript grading will compare. Always a GET; anything needing a body stays
  // in the level's own `req:`, which can carry one.
  async function handleNavigate(path) {
    if (navBusy) return;
    setNavBusy(true);
    try {
      const source = withDriver({ ...level, req: [`GET ${path}`] }, code, { probe: true });
      // Seeded from the level, not from the carried-over file store: an ad-hoc
      // request is a fresh look at the app, not a continuation of earlier runs.
      const { responses: seen } = splitProbe(await runWithFiles(source, [], { seedFromLevel: true }));
      const base = Array.isArray(responses) ? responses : [];
      if (seen?.length) {
        setResponses([...base, ...seen]);
        setSelected(base.length);
      }
    } finally {
      setNavBusy(false);
    }
  }
  // On a full-stack level the served page fetches the student's own API, so the
  // preview gets the same bridge the grader uses — built from every response in
  // the tab, including ones the address bar added. Empty everywhere else, which
  // is what keeps the ordinary backend preview script-free.
  const previewPrelude =
    isFullstackLevel(level) && Array.isArray(responses) ? fetchShimScript(routeTable(responses)) : "";

  // Rebuilt every render rather than memoised. Nothing downstream is keyed on
  // its identity — FilePanel only asks whether the active tab is one of these —
  // and the node sits in a fixed position, so React re-renders the preview
  // instead of remounting it and the selected request survives.
  const browserTabs = isBackendLevel
    ? [{
        id: "browser",
        label: "browser",
        accent: "#7AA2F7",
        icon: <Globe size={11} strokeWidth={2.5} />,
        node: (
          <BackendPreview
            responses={responses}
            see={level.see}
            selected={selected}
            onSelect={setSelected}
            onNavigate={handleNavigate}
            busy={navBusy}
            prelude={previewPrelude}
          />
        ),
      }]
    : undefined;

  const handleSqlRun = async () => {
    if (sqlRunning) return;
    setSqlRunning(true);
    try {
      // No reference answer: Run is for exploring the data, not for judging it.
      const { student } = await runSql(sqlSetup, code, null);
      setSqlResult(student);
    } catch (err) {
      setSqlResult({
        error: err.message === "TIMEOUT"
          ? "That query never finished and was stopped. A recursive query with no stopping condition will do this."
          : String(err.message),
      });
    } finally {
      setSqlRunning(false);
    }
  };

  // Grading a query means comparing it against the level's own answer, run a
  // moment earlier against a second, identical, freshly seeded database. Nothing
  // is hand-written, which is the same reason the Python tracks capture expected
  // output by running their solution instead of predicting it.
  const runSqlChecks = async () => {
    // Before the clock starts, for the same reason the Python path warms Pyodide
    // first: execTime feeds the speed star, and billing a cold engine's download
    // to the student's query costs them a star on a correct answer.
    await warmSqlWorker().catch(() => {});

    const startTime = performance.now();

    const lineCount = code
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length;

    const maxLines = level.maxLines ?? lineCount + 1;
    const maxTime = level.maxTime ?? 1;

    let res;
    try {
      res = await runSql(sqlSetup, code, level.solution);
    } catch (err) {
      setTesting(false);
      playWrongSound();
      setTestFailure({
        input: "",
        checklist: [
          err.message === "TIMEOUT"
            ? "Your query never finished, so it was stopped. A recursive query with no stopping condition will do this."
            : `The database could not be started: ${err.message}`,
        ],
      });
      return;
    }

    const execTime = (performance.now() - startTime) / 1000;
    setSqlResult(res.student);
    setTesting(false);

    const verdict = gradeSql(res.student, res.expected, {
      ordered: level.ordered ?? wantsOrder(level.solution),
      matchCols: Boolean(level.matchCols),
    });

    if (!verdict.passed) {
      debugFail("sql mismatch", { level: level.name, failures: verdict.failures, student: res.student, expected: res.expected });
      playWrongSound();
      // A checklist, not an expected/actual pair: printing the whole correct
      // table beside theirs would just be the answer.
      setTestFailure({ input: "", checklist: verdict.failures });
      return;
    }

    // Same reason the JavaScript track has these: the right rows can be reached
    // by typing the values out as literals, and on a level about GROUP BY that
    // is not the thing being learned. Regex forms only, so no Pyodide loads.
    if (level.sourceChecks) {
      const structResult = await validateStructure(code, level.sourceChecks);
      if (!structResult.valid) {
        debugFail("sql source check failed", { level: level.name, error: structResult.error });
        playWrongSound();
        setTestFailure({ input: "", checklist: [structResult.error] });
        return;
      }
    }

    let stars = 1;
    if (lineCount <= maxLines) stars++;
    if (execTime <= maxTime) stars++;
    playCompleteSound(stars);
    completeLevel(trackName, level.id, stars);
    if (stars < 3) saveCode(trackName, level.id, code); else clearSavedCode(trackName, level.id);
    setEarnedStars(stars);
    setResultInfo({ lineCount, maxLines, execTime, maxTime });
    setShowModal(true);
  };

  const runWebChecks = async () => {
    const startTime = performance.now();

    const lineCount = code
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length;

    const maxLines = level.maxLines ?? lineCount + 1;
    const maxTime = level.maxTime ?? 1;

    // A JavaScript level is graded on what it printed, so the console only needs
    // capturing when the level actually declares output tests — an HTML level
    // has no reason to pay for it.
    const outputTests = level.tests ?? [];
    const result = await runWebLevel(webFiles(code), level.expect, {
      captureConsole: outputTests.length > 0,
      actions: level.act,
    });
    const execTime = (performance.now() - startTime) / 1000;

    setTesting(false);

    if (!result.passed) {
      debugFail("web assertions failed", { level: level.name, failures: result.failures, error: result.error });
      playWrongSound();
      // A checklist rather than an expected/actual pair: there is no single
      // expected string for a page, and printing an empty EXPECTED box next to
      // the student's markup would only suggest the check itself was broken.
      setTestFailure({ input: "", checklist: result.failures || [] });
      return;
    }

    // Output tests come second so a thrown error is reported as the error it is,
    // rather than as "your output was empty" — which is true but useless.
    const failedTest = outputTests.find((t) => !checkOutput(result.output, t));
    if (failedTest) {
      debugFail("web output mismatch", { level: level.name, actual: result.output });
      playWrongSound();
      // Here an expected/actual pair IS the right shape: unlike a page, printed
      // output has exactly one right answer to show them.
      setTestFailure({
        input: "",
        expected: failedTest.expected ?? failedTest.expectAnyOf?.[0] ?? "",
        actual: result.output || "(nothing was printed)",
      });
      return;
    }

    // Last, because it is the least specific complaint: a student who wrote a
    // loop but printed the wrong thing should hear about the output, not about
    // their loop. It exists at all because output alone cannot tell a `for` loop
    // from someone who worked out the answer and typed it into a console.log —
    // and it stays Pyodide-free as long as web levels use only `has:`/`no:`,
    // which tests/webLevels.test.js enforces.
    if (level.sourceChecks) {
      const structResult = await validateStructure(code, level.sourceChecks);
      if (!structResult.valid) {
        debugFail("web source check failed", { level: level.name, error: structResult.error });
        playWrongSound();
        setTestFailure({ input: "", checklist: [structResult.error] });
        return;
      }
    }

    let stars = 1;
    if (lineCount <= maxLines) stars++;
    if (execTime <= maxTime) stars++;
    playCompleteSound(stars);
    completeLevel(trackName, level.id, stars);
    if (stars < 3) saveCode(trackName, level.id, code); else clearSavedCode(trackName, level.id);
    setEarnedStars(stars);
    setResultInfo({ lineCount, maxLines, execTime, maxTime });
    setShowModal(true);
  };

  // A full-stack level is graded on the page the student's own Python served.
  // It runs the Python exactly as a backend level does, then hands the response
  // body to exactly the grader the HTML track uses — neither half is a special
  // case, which is the only reason two engines can share one verdict.
  const runFullstackChecks = async () => {
    await warmPyodideWorker().catch(() => {});
    const startTime = performance.now();

    const lineCount = code
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length;

    const maxLines = level.maxLines ?? lineCount + 1;
    const maxTime = level.maxTime ?? 1;

    // Probe composition, like Run: the page and the paths it fetches come back
    // as data. Submit still never compares stdout here — there is nothing to
    // compare it against, because the verdict lives in the DOM.
    const stdout = await runWithFiles(withDriver(level, code, { probe: true }), [], { seedFromLevel: true });
    const { output, responses: seen } = splitProbe(stdout);
    setResponses(seen);
    setSelected(0);

    const page = pageFrom(level, seen);
    const execTime = (performance.now() - startTime) / 1000;

    if (page.error) {
      setTesting(false);
      debugFail("fullstack page missing", { level: level.name, error: page.error });
      playWrongSound();
      // The console head comes along: when the program crashed, the traceback is
      // the actual answer and the checklist line is only a signpost to it.
      setTestFailure({ input: "", checklist: [page.error], actual: output.trim() || undefined });
      return;
    }

    const result = await runWebLevel({ "index.html": page.html }, level.expect, {
      prelude: page.prelude,
      actions: level.act,
    });

    setTesting(false);

    if (!result.passed) {
      debugFail("fullstack assertions failed", { level: level.name, failures: result.failures });
      playWrongSound();
      setTestFailure({ input: "", checklist: result.failures || [] });
      return;
    }

    // Some of what these levels teach never reaches the page. A redirect after a
    // POST leaves the same list on screen either way — what changed is the
    // status of a request the browser followed. So a level may also assert on
    // the driver's transcript, and both halves have to hold.
    const failedTest = (level.tests ?? []).find((t) => !checkOutput(output, t));
    if (failedTest) {
      debugFail("fullstack transcript mismatch", { level: level.name, actual: output });
      playWrongSound();
      setTestFailure({
        input: "",
        expected: failedTest.expected ?? failedTest.expectAnyOf?.[0] ?? "",
        actual: output.trim() || "(nothing was printed)",
      });
      return;
    }

    if (level.sourceChecks) {
      const structResult = await validateStructure(code, level.sourceChecks);
      if (!structResult.valid) {
        debugFail("fullstack source check failed", { level: level.name, error: structResult.error });
        playWrongSound();
        setTestFailure({ input: "", checklist: [structResult.error] });
        return;
      }
    }

    let stars = 1;
    if (lineCount <= maxLines) stars++;
    if (execTime <= maxTime) stars++;
    playCompleteSound(stars);
    completeLevel(trackName, level.id, stars);
    if (stars < 3) saveCode(trackName, level.id, code); else clearSavedCode(trackName, level.id);
    setEarnedStars(stars);
    setResultInfo({ lineCount, maxLines, execTime, maxTime });
    setShowModal(true);
  };

  const runChecks = async () => {
    setTestFailure(null);
    setTesting(true);

    const tracked = level?.files?.track || [];
    const snapshot = {};
    for (const name of tracked) {
      snapshot[name] = fileStore.current[name];
    }
    setFileEntriesBefore(snapshot);

    // Web levels never touch Python, so they branch out before the Pyodide
    // warm-up below — booting a 20MB interpreter to grade an `<h1>` would be a
    // slow way to do nothing.
    if (level.web) {
      await runWebChecks();
      return;
    }

    // Same reasoning for SQL: SQLite is ~1.2MB and already warm by the time the
    // student has read the question. Booting Python beside it would add 20MB to
    // grade a SELECT.
    if (level.sql) {
      await runSqlChecks();
      return;
    }

    // Python-then-DOM. Branches here rather than inside the Python path below
    // because everything after this point is built around comparing stdout, and
    // a full-stack level has no expected stdout to compare.
    if (isFullstackLevel(level)) {
      await runFullstackChecks();
      return;
    }

    // Make sure the interpreter is already up before the clock starts. execTime
    // is wall-clock and feeds the speed star, so on a cold first submit the
    // ~2s Pyodide boot used to be billed to the student's code and cost them
    // the star on a correct answer — retrying immediately then scored 3/3,
    // which is exactly how a tester spotted it. The warm-up is idempotent, so
    // once it is up this resolves instantly.
    await warmPyodideWorker().catch(() => {});

    const startTime = performance.now();

    const lineCount = code
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length;

    const maxLines = level.maxLines ?? lineCount + 1;
    const maxTime = level.maxTime ?? 1;

    // A backend level's handlers print nothing, so the grader appends the
    // requests that exercise them. The student's submission has to be composed
    // exactly the way runnableSource composes the reference solution, or the two
    // are not comparable. lineCount above is measured on the raw editor text on
    // purpose: the driver is not the student's code and must not cost a star.
    const submitted = withDriver(level, code);

    let execTime;

    const hasTests = level.tests && level.tests.length > 0;

      if (hasTests) {
        const inputSets = level.tests.map((t) =>
          t.input ? (Array.isArray(t.input) ? t.input : [t.input]) : []
        );

        // One Python process for all tests. Falls back to one-process-per-test
        // if batch mode is unavailable (production/Pyodide path).
        let batch = null;
        if (!level?.files) {
          batch = await runPythonRealBatch(submitted, {}, [], inputSets);
        }
        if (DEV) {
          console.debug(`[submit] level="${level.name}" tests=${inputSets.length} mode=${batch ? "batch(1 process)" : "per-test"} elapsedMs=${Math.round(performance.now() - startTime)}`);
        }

        for (let ti = 0; ti < level.tests.length; ti++) {
          const test = level.tests[ti];
          const inputs = inputSets[ti];
          const output = batch ? batch.stdouts[ti] : await runWithFiles(submitted, inputs, { seedFromLevel: true });
          const clean = norm(output);
          const exp = norm(test.expected ?? "");
          const match = checkOutput(output, test);
        if (!match) {
          debugFail("test mismatch", { level: level.name, inputs, matchMode: test.expectAnyOf ? "anyOf" : test.expectMatch ? "regex" : "exact", expected: exp, actual: clean, raw: output, diff: diffStrings(exp, clean) });
          playWrongSound();
          // A regex test carries no literal expected string, so EXPECTED used to
          // render as an empty box: the student saw "Test Failed" with nothing to
          // compare against. Fall back to the level's example output and label it
          // a shape, since the real values (random numbers, timestamps) differ
          // every run and can never be printed as one fixed answer.
          const isShape = test.expectMatch !== undefined && test.expected === undefined && test.expectAnyOf === undefined;
          setTestFailure({
            input: test.input,
            expected: isShape ? level.example?.output : (test.expected ?? test.expectAnyOf),
            isShape,
            actual: clean,
          });
          setTesting(false);
          return;
        }
      }

      if (level.sourceChecks) {
        const structResult = await validateStructure(code, level.sourceChecks);
        if (!structResult.valid) {
          debugFail("source check failed", {
            level: level.name,
            sourceChecks: level.sourceChecks,
            error: structResult.error,
          });
          playWrongSound();
          setTestFailure({
            input: "",
            expected: "Required code structure",
            actual: structResult.error,
          });
          setTesting(false);
          return;
        }
      }

      // Speed star: when the batch runner reports per-test timings, grade the
      // student's CODE (slowest single test, measured inside Python) instead of
      // wall-clock, which included process spawn, HTTP, and antivirus overhead
      // and therefore graded the student's hardware.
      execTime = batch?.timings?.length
        ? Math.max(...batch.timings)
        : (performance.now() - startTime) / 1000;
      if (DEV && batch?.timings) {
        console.debug(`[submit] pure exec times (s): ${batch.timings.map((t) => t.toFixed(3)).join(", ")} | scored=${execTime.toFixed(3)} maxTime=${maxTime}`);
      }
      setTesting(false);
      let stars = 1;
      if (lineCount <= maxLines) stars++;
      if (execTime <= maxTime) stars++;
      playCompleteSound(stars);
      completeLevel(trackName, level.id, stars);
      if (stars < 3) saveCode(trackName, level.id, code); else clearSavedCode(trackName, level.id);
      setEarnedStars(stars);
      setResultInfo({ lineCount, maxLines, execTime, maxTime });
      setShowModal(true);
    } else {
      const solutionHasPrint = level.solution.includes("print(");

      if (solutionHasPrint) {
        const actualOutput = await runWithFiles(submitted, [], { seedFromLevel: true });
        let expectedOutput = solutionCacheRef.current?.stdout;
        if (expectedOutput === undefined) {
          const result = await runCodeFrom(runnableSource(trackName, level), { ...(level?.files?.initial || {}) }, []);
          expectedOutput = result.stdout || "";
        }

        execTime = (performance.now() - startTime) / 1000;

        if (matchOutput(actualOutput, expectedOutput)) {
          let stars = 1;
          if (lineCount <= maxLines) stars++;
          if (execTime <= maxTime) stars++;
          playCompleteSound(stars);
          completeLevel(trackName, level.id, stars);
          setEarnedStars(stars);
          setResultInfo({ lineCount, maxLines, execTime, maxTime });
          setShowModal(true);
        } else {
          debugFail("print mismatch", { level: level.name, rawActual: actualOutput, rawExpected: expectedOutput, diff: diffStrings(norm(expectedOutput), norm(actualOutput)) });
          playWrongSound();
          setTestFailure({ input: "", expected: norm(expectedOutput), actual: norm(actualOutput) });
        }
        setTesting(false);
        return;
      }

      const varMatch = level.solution.match(/^\s*(\w+)\s*=\s*/m);
      if (varMatch) {
        const varName = varMatch[1];
        const needsInput = code.includes("input(") || code.includes("input (");
        const inputs = needsInput ? ["test"] : [];
        const inputDisplay = needsInput ? "test" : "";

        const solutionCode = runnableSource(trackName, level);
        const actualOutput = await runWithFiles(code + "\nprint(" + varName + ")", inputs, { seedFromLevel: true });
        const expectedOutput = await runWithFiles(solutionCode + "\nprint(" + varName + ")", inputs, { seedFromLevel: true });

        execTime = (performance.now() - startTime) / 1000;

        if (matchOutput(actualOutput, expectedOutput)) {
          let stars = 1;
          if (lineCount <= maxLines) stars++;
          if (execTime <= maxTime) stars++;
          playCompleteSound(stars);
          completeLevel(trackName, level.id, stars);
          setEarnedStars(stars);
          setResultInfo({ lineCount, maxLines, execTime, maxTime });
          setShowModal(true);
        } else {
          debugFail("var mismatch", { level: level.name, varName, rawActual: actualOutput, rawExpected: expectedOutput, diff: diffStrings(norm(expectedOutput), norm(actualOutput)) });
          playWrongSound();
          setTestFailure({ input: inputDisplay, expected: norm(expectedOutput), actual: norm(actualOutput) });
        }
        setTesting(false);
        return;
      }

      if (level?.files?.track?.length > 0) {
        const initialFiles = level?.files?.initial ? { ...level.files.initial } : {};
        const trackedFiles = level.files.track;

        const userResult = await runCodeFrom(code, initialFiles, []);
        let expectedFiles = solutionCacheRef.current?.files;
        if (expectedFiles === undefined || expectedFiles === null) {
          const result = await runCodeFrom(runnableSource(trackName, level), initialFiles, []);
          expectedFiles = result.files || {};
        }

        execTime = (performance.now() - startTime) / 1000;

        let filesMatch = true;
        let mismatchInfo = null;
        for (const fileName of trackedFiles) {
          const userContent = (userResult.files || {})[fileName];
          const expectedContent = expectedFiles[fileName];
          if (userContent !== expectedContent) {
            filesMatch = false;
            mismatchInfo = { fileName, expected: expectedContent ?? "(file does not exist)", actual: userContent ?? "(file does not exist)" };
            break;
          }
        }

        if (userResult.files && Object.keys(userResult.files).length > 0) {
          fileStore.current = mergeFileStore(fileStore.current, null, userResult.files);
          syncFileStore();
        }

        if (filesMatch) {
          let stars = 1;
          if (lineCount <= maxLines) stars++;
          if (execTime <= maxTime) stars++;
          playCompleteSound(stars);
          completeLevel(trackName, level.id, stars);
          setEarnedStars(stars);
          setResultInfo({ lineCount, maxLines, execTime, maxTime });
          setShowModal(true);
        } else {
          debugFail("file mismatch", { level: level.name, fileName: mismatchInfo.fileName, expected: mismatchInfo.expected, actual: mismatchInfo.actual, diff: diffStrings(mismatchInfo.expected, mismatchInfo.actual) });
          playWrongSound();
          setTestFailure({
            input: "",
            expected: `${mismatchInfo.fileName} content:\n${mismatchInfo.expected}`,
            actual: `${mismatchInfo.fileName} content:\n${mismatchInfo.actual}`,
          });
        }
        setTesting(false);
        return;
      }

      const fullSolution = runnableSource(trackName, level);
      // Both start from the level's seed, so the submission and the reference
      // solution are judged against identical filesystems rather than each
      // other's leftovers.
      const [actualOutput, expectedOutput] = await Promise.all([
        runWithFiles(code, [], { seedFromLevel: true }),
        runWithFiles(fullSolution, [], { seedFromLevel: true }),
      ]);

      execTime = (performance.now() - startTime) / 1000;

      const strippedActual = norm(actualOutput);
      const strippedExpected = norm(expectedOutput);

      if (matchOutput(actualOutput, expectedOutput)) {
        if (level.sourceChecks) {
          const result = await validateStructure(code, level.sourceChecks);
          if (!result.valid) {
            debugFail("source check failed", { level: level.name, sourceChecks: level.sourceChecks, error: result.error });
            playWrongSound();
            setTestFailure({ input: "", expected: "", actual: result.error });
            setTesting(false);
            return;
          }
        }
        let stars = 1;
        if (lineCount <= maxLines) stars++;
        if (execTime <= maxTime) stars++;
        playCompleteSound(stars);
        completeLevel(trackName, level.id, stars);
        setEarnedStars(stars);
        setResultInfo({ lineCount, maxLines, execTime, maxTime });
        setShowModal(true);
      } else {
        debugFail("output mismatch", { level: level.name, rawActual: actualOutput, rawExpected: expectedOutput, diff: diffStrings(strippedExpected, strippedActual) });
        playWrongSound();
        setTestFailure({ input: "", expected: strippedExpected, actual: strippedActual });
      }
      setTesting(false);
    }
  };

  // Game levels have no output to grade, so completing them is a "goal" check:
  // validate the student's code against the level's sourceChecks and, on pass,
  // award the full 3 stars. A game level with NO sourceChecks is a free-build
  // sandbox: validateStructure passes immediately, so submitting always
  // completes it. The button is labelled accordingly.
  const isSandbox = Boolean(level?.game && !level?.sourceChecks);

  const handleGameCheck = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await validateStructure(code, level.sourceChecks);
      if (res.valid) {
        playCompleteSound(3);
        completeLevel(trackName, level.id, 3);
        // Deliberately NOT clearing the saved code: on a game level the
        // student's edits are the thing worth keeping, and on the free-build
        // level clearing them would throw away their whole project.
        saveCode(trackName, level.id, code);
        setEarnedStars(3);
        setResultInfo(null);
        setShowModal(true);
      } else {
        playWrongSound();
        setTestFailure({ input: "", expected: "Goal", actual: res.error });
      }
    } finally {
      setTesting(false);
    }
  };

  // The hint now lives behind its own tab in the aside, so "show the hint" means
  // "switch to that tab". Toggling back returns to the description rather than
  // leaving the panel on an empty tab.
  const handleHintToggle = () => {
    setActiveTab((prev) => (prev === "hint" ? "description" : "hint"));
  };

  if (!track || !chapter || !level) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center text-center relative z-10">
        <Compass size={56} strokeWidth={1.5} className="mb-4 opacity-60" />
        <h1
          className="text-2xl font-black mb-2"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          Level not found
        </h1>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-secondary)" }}>
          This quest doesn't exist or may have moved. Let's get you back on the path.
        </p>
        <PixelButton onClick={() => navigate("/tracks")}>
          <ArrowLeft size={14} className="inline mr-1" /> Back to tracks
        </PixelButton>
      </div>
    );
  }

  // The chapter list hides locked chapters, but the URL is still typeable and
  // old links still exist, so the gate has to live here too.
  const chapterIndex = track.chapters.findIndex((ch) => ch.id === chapter.id);
  if (!isChapterUnlocked(track, chapterIndex, getStars, { unlockAll: isAdmin })) {
    const blocker = blockingChapterName(track, chapterIndex);
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center text-center relative z-10">
        <Lock size={56} strokeWidth={1.5} className="mb-4 opacity-60" />
        <h1
          className="text-2xl font-black mb-2"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {chapter.name} is locked
        </h1>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-secondary)" }}>
          {blocker
            ? <>Finish the last level of <strong style={{ color: "var(--text)" }}>{blocker}</strong> to open this chapter.</>
            : "Finish the previous chapter to open this one."}
        </p>
        <PixelButton onClick={() => navigate(`/tracks/${track.slug}`)}>
          <ArrowLeft size={14} className="inline mr-1" /> Back to {track.name}
        </PixelButton>
      </div>
    );
  }

  const completedCount = chapter.levels.filter(
    (l) => getLevelStatus(track.slug, l.id) === "completed"
  ).length;
  const progress = Math.round((completedCount / chapter.levels.length) * 100);
  const isCompleted = status === "completed";
  const currentStars = getStars(track.slug, level.id);
  const totalStars = getTotalStars(track.slug);
  const levelIndex = chapter.levels.findIndex((l) => l.id === level.id);
  const hasNextLevel = levelIndex < chapter.levels.length - 1;
  const hasPreviousLevel = levelIndex > 0;

  // Example, Hint and Visualization only appear when the level actually has
  // them, so a bare level still shows a short, honest row.
  const TABS = [
    { id: "description", label: "Description", icon: Target, show: true },
    { id: "example", label: "Example", icon: FlaskConical, show: Boolean(level.example) },
    { id: "hint", label: "Hint", icon: Lightbulb, show: Boolean(level.hint && level.hint.length > 0) },
    { id: "viz", label: "Visualization", icon: Activity, show: Boolean(level.viz) },
    { id: "levels", label: "Levels", icon: LayoutList, show: true },
  ].filter((t) => t.show);

  return (
    <>
      {showModal && (
        <CompletionModal
          level={level}
          stars={earnedStars}
          resultInfo={resultInfo}
          notice={lastNotice}
          onRetry={() => {
            setShowModal(false);
            setActiveTab("description");
          }}
          onContinue={() => {
            setShowModal(false);
            goToNextLevel();
          }}
        />
      )}

      {gameOpen && <GameModal code={code} onClose={() => setGameOpen(false)} />}

      {/* Hidden while a modal is up: the completion and failure panels are the
          thing being read at that moment, and a character bobbing over them
          competes for the same attention. */}
      {companionOn && !showModal && !testFailure && !gameOpen && (
        <Companion level={level} code={code} tone={companionTone} />
      )}

      {testing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.5)" }} />
          <div
            className="relative rounded-2xl p-8 text-center max-w-sm w-full"
            style={{ background: "var(--bg)", border: "3px solid #7AA2F7", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold" style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
                {level.name}
              </h2>
              <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                First time running may take longer...
              </p>
            </div>
          </div>
        </div>
      )}

      {testFailure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setTestFailure(null)}
          />
          <div
            className="relative rounded-2xl max-w-md w-full flex flex-col"
            style={{ background: "var(--bg)", border: "3px solid #FF5F57", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "85vh" }}
          >
            <div className="p-8 pb-4 overflow-y-auto">
              <h2 className="text-xl font-bold mb-4 text-center" style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
                {testFailure.checklist ? "Not Quite Yet" : "Test Failed"}
              </h2>

              {testFailure.checklist && (
                <div className="rounded-xl p-3 mb-3 text-left" style={{ background: "#1e1e2e" }}>
                  <div className="text-xs font-bold mb-2" style={{ color: "#FF5F57" }}>STILL MISSING</div>
                  <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
                    {testFailure.checklist.map((line, i) => (
                      <li key={i} className="text-xs leading-relaxed flex gap-2" style={{ color: "#CDD6F4" }}>
                        <span aria-hidden="true" style={{ color: "#FF5F57" }}>·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!testFailure.checklist && testFailure.input !== undefined && testFailure.input !== "" && (
                <div className="rounded-xl p-3 mb-3 text-left" style={{ background: "#1e1e2e" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "#9CA3AF" }}>INPUT</div>
                  <pre className="text-xs font-mono m-0" style={{ color: "#CDD6F4", whiteSpace: "pre-wrap" }}>{Array.isArray(testFailure.input) ? testFailure.input.join("\n") : testFailure.input}</pre>
                </div>
              )}

              {!testFailure.checklist && (
                <>
                  <div className="rounded-xl p-3 mb-3 text-left" style={{ background: "#1e1e2e" }}>
                    <div className="text-xs font-bold mb-1" style={{ color: "#28CA41" }}>
                      {testFailure.isShape ? "EXPECTED SHAPE · random values will differ" : "EXPECTED"}
                    </div>
                    <pre className="text-xs font-mono m-0" style={{ color: "#CDD6F4", whiteSpace: "pre-wrap" }}>{testFailure.expected || "(this level accepts any output matching the shape above)"}</pre>
                  </div>

                  <div className="rounded-xl p-3 mb-3 text-left" style={{ background: "#1e1e2e" }}>
                    <div className="text-xs font-bold mb-1" style={{ color: "#FF5F57" }}>ACTUAL</div>
                    <pre className="text-xs font-mono m-0" style={{ color: "#CDD6F4", whiteSpace: "pre-wrap" }}>{testFailure.actual || "(no output)"}</pre>
                  </div>
                </>
              )}
            </div>

            <div className="px-8 pb-8 pt-2 text-center shrink-0">
              <PixelButton onClick={() => setTestFailure(null)} size="md" variant="primary">
                Try Again
              </PixelButton>
            </div>
          </div>
        </div>
      )}

      <div key={levelId} className="lg:h-screen lg:overflow-hidden pt-24 pb-24 lg:pb-8 px-4 lg:px-6 relative z-10">
        {/* Capped at 1280px. Fully fluid was right while a third column shared
            the width, but once the sidebar merged into the aside two columns
            stretched to ~1500px and read as too wide. This still gives the
            content 128px more than the original max-w-6xl (1152px) while
            restoring a visible gutter. */}
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(`/tracks/${trackName}`)}
            className="text-sm mb-6 flex items-center gap-1 hover:gap-2 transition-all"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft size={14} className="inline mr-1" /> {chapter.name}
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
            <aside className="lg:col-span-5 lg:self-start">
              {/* Fixed height on laptop rather than max-height: the panel used to
                  shrink to whatever the open tab contained, so switching to a
                  one-line Hint left a stubby card beside a full-height editor.
                  On mobile it still grows with its content.
                  The underscores are required: Tailwind turns them into spaces,
                  and calc() is invalid CSS without whitespace around the minus,
                  so `calc(100vh-10rem)` was silently dropped by the browser. */}
              <div
                className="rounded-2xl lg:h-[calc(100vh-10rem)] flex flex-col overflow-hidden"
                style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
              >
                <div className="p-5 pb-0">
                  <div
                    className="flex items-center justify-between mb-3"
                  >
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Level {level.id}
                    </span>
                    <div className="flex gap-0.5">
                      {hasPreviousLevel && (
                        <button
                          onClick={() => navigate(`/tracks/${trackName}/${chapterId}/${chapter.levels[levelIndex - 1].id}`)}
                          className="flex items-center justify-center transition-all duration-100 hover:brightness-110 active:translate-y-0.5"
                          style={{ width: 28, height: 28, borderRadius: 8, background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text-muted)" }}
                        >
                          <ChevronLeft size={16} strokeWidth={2.5} />
                        </button>
                      )}
                      {hasNextLevel && (
                        <button
                          onClick={() => navigate(`/tracks/${trackName}/${chapterId}/${chapter.levels[levelIndex + 1].id}`)}
                          className="flex items-center justify-center transition-all duration-100 hover:brightness-110 active:translate-y-0.5"
                          style={{ width: 28, height: 28, borderRadius: 8, background: "var(--bg)", border: "1.5px solid var(--border-strong)", color: "var(--text-muted)" }}
                        >
                          <ChevronRight size={16} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Stars sit on the title's line. min-w-0 lets a long name wrap
                      instead of shoving them out of the panel, and shrink-0 keeps
                      the three of them from being squeezed. */}
                  <div className="flex items-baseline gap-3">
                    <h2
                      className="text-xl font-black min-w-0"
                      style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
                    >
                      {level.name}
                    </h2>

                    {isCompleted && currentStars > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {[1, 2, 3].map((s) => (
                          <StarIcon key={s} filled={s <= currentStars} className="text-base" />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tabs collapse to just an icon unless they are selected or
                      hovered, which keeps the row short enough to fit even the
                      343px mobile column with five tabs open. overflow-x-auto +
                      whitespace-nowrap mirrors the editor's file tabs
                      (src/editor/FilePanel.jsx) as the safety net. */}
                  <div className="flex gap-1 mt-4 -mb-px overflow-x-auto">
                    {TABS.map((t) => {
                      const active = activeTab === t.id;
                      const expanded = active || hoveredTab === t.id;
                      const TabIcon = t.icon;
                      return (
                        <button
                          key={t.id}
                          title={t.label}
                          onClick={() => setActiveTab(t.id)}
                          onMouseEnter={() => setHoveredTab(t.id)}
                          onMouseLeave={() => setHoveredTab(null)}
                          onFocus={() => setHoveredTab(t.id)}
                          onBlur={() => setHoveredTab(null)}
                          className="flex items-center text-xs font-bold uppercase tracking-wider px-2 pb-2 pt-1 shrink-0 whitespace-nowrap transition-colors"
                          style={{
                            color: active ? "var(--text)" : "var(--text-muted)",
                            borderBottom: `2px solid ${active ? "#6AAE6F" : "transparent"}`,
                          }}
                        >
                          <TabIcon size={13} strokeWidth={2.5} className="shrink-0" />
                          {/* Animating max-width looked like an instant pop: the
                              label is only ~45px wide, so growing a 160px cap
                              finished the visible motion in the first quarter of
                              the duration and then sat still. Animating a grid
                              column from 0fr to 1fr eases to the label's OWN
                              width instead, so the whole duration is visible. */}
                          <span
                            className="grid"
                            style={{
                              gridTemplateColumns: expanded ? "1fr" : "0fr",
                              opacity: expanded ? 1 : 0,
                              transition: "grid-template-columns 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
                            }}
                          >
                            <span className="overflow-hidden">
                              <span className="pl-1.5">{t.label}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="flex-1 overflow-y-auto min-h-0 px-5 pt-4 pb-1"
                  style={{ scrollbarWidth: "thin", borderTop: "1px solid var(--border-strong)" }}
                >
                {/* Panels are hidden with display:none rather than unmounted, the
                    same way the editor keeps its CodeMirror instance alive
                    (CodeEditorContainer/FilePanel). For the visualization this is
                    a correctness requirement, not a style choice: it holds its
                    parsed trace and playback position in local state, so
                    unmounting would throw away a run every time the student
                    glanced at the description. */}
                <div style={{ display: activeTab === "description" ? "block" : "none" }}>
                  <div className="mb-4">
                    <div
                      className="text-xs font-bold mb-2 uppercase tracking-wider"
                      style={{ color: "#6AAE6F" }}
                    >
                      <span className="inline-flex items-center gap-1.5"><Target size={13} strokeWidth={2.5} /> Objective</span>
                    </div>
                    <RichText blocks={level.objective} />
                  </div>

                  {level.explanation && (
                    <div className="mb-4 pt-4" style={{ borderTop: "1px solid var(--border-strong)" }}>
                      <div
                        className="text-xs font-bold mb-2"
                        style={{ color: "#7AA2F7" }}
                      >
                        <span className="inline-flex items-center gap-1.5"><BookOpen size={12} strokeWidth={2.5} /> EXPLANATION</span>
                      </div>
                      <RichText blocks={level.explanation} />
                    </div>
                  )}
                </div>

                {/* The example used to be hidden whenever a level had an
                    explanation, because both competed for the same column. With
                    its own tab it can always be shown when the level has one. */}
                {level.example && (
                  <div className="mb-4" style={{ display: activeTab === "example" ? "block" : "none" }}>
                    <div
                      className="text-xs font-bold mb-2"
                      style={{ color: "#6AAE6F" }}
                    >
                      <span className="inline-flex items-center gap-1.5"><FlaskConical size={12} strokeWidth={2.5} /> EXAMPLE</span>
                    </div>
                    <div className="text-sm" style={{ color: "var(--text)" }}>
                      <div className="mb-1">
                        <span className="font-bold" style={{ color: "var(--text-muted)" }}>Input:</span>
                        <pre className="text-xs font-mono mt-1 mb-0" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
                          {Array.isArray(level.example.input) ? level.example.input.join("\n") : level.example.input}
                        </pre>
                      </div>
                      <div>
                        <span className="font-bold" style={{ color: "var(--text-muted)" }}>Output:</span>
                        <pre className="text-xs font-mono mt-1 mb-0" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>{level.example.output}</pre>
                      </div>
                    </div>
                  </div>
                )}

                {level.hint && level.hint.length > 0 && (
                  <div className="mb-4" style={{ display: activeTab === "hint" ? "block" : "none" }}>
                    <div
                      className="text-xs font-bold mb-2"
                      style={{ color: "#E9B44C" }}
                    >
                      <span className="inline-flex items-center gap-1.5"><Lightbulb size={12} strokeWidth={2.5} /> HINT</span>
                    </div>
                    <RichText blocks={level.hint} />
                  </div>
                )}

                {level.viz && (
                  <div className="mb-4" style={{ display: activeTab === "viz" ? "block" : "none" }}>
                    {createElement(getVisualization(level.viz), { code, level })}
                  </div>
                )}

                <div className="mb-4" style={{ display: activeTab === "levels" ? "block" : "none" }}>
                  {/* Sized for the 610px aside. The original values were picked
                      for the old 354px sidebar and looked undersized once this
                      panel took over the full column. */}
                  {/* Icon sits to the left of the whole block, with the chapter
                      name and its progress bar stacked beside it. */}
                  <div className="flex items-center gap-3 mb-3">
                    <Icon src={chapter.chapterIcon} alt={chapter.name} size={34} color={diff.color} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold truncate block mb-1.5" style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
                        {chapter.name}
                      </span>
                      <ProgressBar value={progress} showLabel={false} height={5} />
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {completedCount}/{chapter.levels.length} · {totalStars} <Star size={11} strokeWidth={2.5} fill="currentColor" className="inline align-baseline" />
                      </p>
                    </div>
                  </div>

                  {chapter.levels.map((lv, i) => {
                    const stars = getStars(trackName, lv.id);
                    const current = lv.id === level.id;
                    return (
                      <button
                        key={lv.id}
                        onClick={() => navigate(`/tracks/${trackName}/${chapterId}/${lv.id}`)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors hover:brightness-125"
                        style={{
                          background: current ? "#6AAE6F20" : "transparent",
                          border: `1px solid ${current ? "#6AAE6F60" : "transparent"}`,
                        }}
                      >
                        <span className="text-xs font-mono shrink-0 w-6 text-right" style={{ color: "var(--text-muted)" }}>
                          {i + 1}
                        </span>
                        {stars > 0 ? (
                          <Check size={16} strokeWidth={3} style={{ color: "#6AAE6F", flexShrink: 0 }} />
                        ) : (
                          <span className="shrink-0" style={{ width: 16 }} />
                        )}
                        <span
                          className="text-sm truncate flex-1"
                          style={{ color: current ? "var(--text)" : "var(--text-secondary)", fontWeight: current ? 700 : 400 }}
                        >
                          {lv.name}
                        </span>
                        {/* One star per star earned, rather than a "2★" count.
                            Drawn with the lucide icon, not a ★ glyph, matching
                            how the rest of the UI renders icons. */}
                        {stars > 0 && (
                          <span className="flex items-center gap-0.5 shrink-0" style={{ color: "#E9B44C" }}>
                            {Array.from({ length: stars }).map((_, s) => (
                              <Star key={s} size={14} strokeWidth={2.5} fill="currentColor" />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                </div>

                {/* Desktop action buttons, on mobile these move to the sticky bottom bar */}
                <div className="hidden lg:flex flex-col gap-2 p-5 pt-3" style={{ borderTop: "1px solid var(--border-strong)" }}>
                  {/* No Run Game button here on desktop: the editor header already
                      has its own Run control for game levels, so a second one in
                      this column is redundant. Mobile keeps it in the sticky bar,
                      where the action buttons are thumb-reachable. */}
                  {level.game ? (
                    <PixelButton onClick={handleGameCheck} size="md" variant="primary" disabled={testing}>
                      {testing ? "Checking..." : (<span className="inline-flex items-center justify-center gap-1.5"><Check size={14} strokeWidth={3} /> {isSandbox ? "Submit" : "Check Goal"}</span>)}
                    </PixelButton>
                  ) : (
                    <PixelButton onClick={handleRun} size="md" variant="primary" disabled={testing}>
                      {testing ? "Running..." : "Submit Code"}
                    </PixelButton>
                  )}

                  {level.hint && level.hint.length > 0 && (
                    <PixelButton
                      onClick={handleHintToggle}
                      size="md"
                      variant="accent"
                    >
                      {activeTab === "hint" ? "Hide Hint" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
                    </PixelButton>
                  )}

                </div>
              </div>
            </aside>

            <div className="lg:col-span-7 lg:self-start">
              <CodeEditorContainer
                code={code}
                setCode={setCode}
                language={isSqlLevel ? "SQL" : isJsLevel ? "JavaScript" : level.web ? "HTML" : "Python"}
                files={level.files}
                fileEntries={fileEntries}
                fileStore={fileStore}
                onFileUpdate={syncFileStore}
                fileEntriesBefore={fileEntriesBefore}
                initialFileSnapshot={initialFileSnapshot}
                preview={
                  isSqlLevel ? <SqlResult result={sqlResult} running={sqlRunning} />
                  : level.web ? <WebPreview files={webFiles(code)} nonce={previewNonce} asConsole={isJsLevel && !isDomLevel} />
                  : undefined
                }
                previewLabel={isSqlLevel ? "RESULT" : isJsLevel && !isDomLevel ? "CONSOLE" : "PREVIEW"}
                previewBg={isSqlLevel || (isJsLevel && !isDomLevel) ? (c.isDark ? "#0d0e17" : "#EEF2EB") : "#fff"}
                onRunOverride={
                  level.game ? () => setGameOpen(true)
                  : isSqlLevel ? handleSqlRun
                  : level.web ? () => setPreviewNonce((n) => n + 1)
                  : undefined
                }
                onSubmit={level.game ? handleGameCheck : handleRun}
                transformSource={isBackendLevel ? runWithRequests : undefined}
                onStdout={isBackendLevel ? takeProbe : undefined}
                virtualTabs={browserTabs}
              />

              <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
                {isSqlLevel
                  ? "Click Run to see what your query returns, or Submit to check your answer."
                  : isDomLevel
                  ? "The page updates as you type. Click Run to reload it, or Submit to check your answer."
                  : isJsLevel
                  ? "Your output updates as you type. Click Run to re-run it, or Submit to check your answer."
                  : level.web
                    ? "Your page updates as you type. Click Run to reload it, or Submit to check your answer."
                    : "Write your code above, then click Run to test or Submit to check your answer."}
              </p>
            </div>

          </div>
        </div>

        {/* Mobile sticky action bar, thumb-reachable Hint + Submit (Run lives in the editor header).
            Game levels get two rows (Hint full-width, then Run + Check) instead of cramming three
            buttons into one row, which left too little width for their labels on a phone screen. */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pt-3"
          style={{
            background: "color-mix(in srgb, var(--bg-card) 92%, transparent)",
            backdropFilter: "blur(8px)",
            borderTop: "1.5px solid var(--border-strong)",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          {level.game ? (
            <div className="flex flex-col gap-2">
              {level.hint && level.hint.length > 0 && (
                <PixelButton onClick={handleHintToggle} size="md" variant="accent" className="w-full">
                  {activeTab === "hint" ? "Hide Hint" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
                </PixelButton>
              )}
              <div className="flex gap-2">
                <PixelButton onClick={() => setGameOpen(true)} size="md" variant="secondary" className="flex-1">
                  <span className="inline-flex items-center justify-center gap-1.5"><Play size={13} strokeWidth={3} fill="currentColor" /> Run Game</span>
                </PixelButton>
                <PixelButton onClick={handleGameCheck} size="md" variant="primary" disabled={testing} className="flex-1">
                  {testing ? "Checking..." : (<span className="inline-flex items-center justify-center gap-1.5"><Check size={14} strokeWidth={3} /> {isSandbox ? "Submit" : "Check Goal"}</span>)}
                </PixelButton>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {level.hint && level.hint.length > 0 && (
                <PixelButton onClick={handleHintToggle} size="md" variant="accent" className="flex-[0_0_38%]">
                  {activeTab === "hint" ? "Hide" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
                </PixelButton>
              )}
              <PixelButton onClick={handleRun} size="md" variant="primary" disabled={testing} className="flex-1">
                {testing ? "Running..." : "Submit Code"}
              </PixelButton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
