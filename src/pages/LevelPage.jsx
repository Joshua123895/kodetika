import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, Compass, FlaskConical, Lightbulb, Play, Star, Target } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TRACKS, DIFFICULTY } from "../data/tracks";
import { useProgress, saveCode, getSavedCode, clearSavedCode } from "../hooks/useProgress";

import { runPythonReal, runPythonRealBatch } from "../utils/pythonRunnerReal";
import { mergeFileStore } from "../utils/fileManager";
import { validateStructure } from "../utils/structureValidator";
import { norm, matchOutput, checkOutput } from "../utils/outputMatcher";
import { ensurePyodide } from "../utils/pyodide";
import CompletionModal from "../components/CompletionModal";
import { getVisualization } from "../visualizations";
import CodeEditorContainer from "../components/CodeEditorContainer";
import GameModal from "../game/GameModal";
import ProgressBar from "../components/ProgressBar";
import PixelButton from "../components/PixelButton";
import Icon from "../components/Icon";
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
  const { getLevelStatus, getStars, completeLevel, getTotalStars, codeSyncTick } = useProgress();

  const track = TRACKS.find((t) => t.slug === trackName);
  const chapter = track?.chapters.find((c) => c.id === Number(chapterId));
  const level = chapter?.levels.find((l) => l.id === Number(levelId));
  const status = level ? getLevelStatus(trackName, level.id) : null;
  const diff = track ? (DIFFICULTY[track.difficulty] || DIFFICULTY[1]) : DIFFICULTY[1];

  const fileStore = useRef({});
  const [fileEntries, setFileEntries] = useState({});
  const [fileEntriesBefore, setFileEntriesBefore] = useState({});
  const serverCacheRef = useRef(new Map());
  const prevLevelIdRef = useRef(null);
  const solutionCacheRef = useRef(null);
  const [initialFileSnapshot, setInitialFileSnapshot] = useState(null);

  useEffect(() => {
    // Production has no /api/run-python server, so every run/submit falls back
    // to in-browser Pyodide. Loading its ~20MB WASM runtime is a multi-second
    // one-time cost, without this warm-up it lands inside the first submit's
    // timed execution and can fail the speed star through no fault of the
    // student's code. Dev-server users never need Pyodide, so skip it there.
    if (import.meta.env.PROD) ensurePyodide();
  }, []);

  useEffect(() => {
    solutionCacheRef.current = null;
    if (level?.files) {
      const initialFiles = level.files.initial || {};
      const trackedFiles = level.files.track || [];
      const fullSolution = (level.startingCode || "") + level.solution;
      runPythonReal(fullSolution, initialFiles, trackedFiles, [])
        .then((result) => {
          solutionCacheRef.current = {
            stdout: result.stdout || "",
            files: result.files || {},
          };
        })
        .catch(() => {});
    }
  }, [level]);

  function syncFileStore() {
    setFileEntries({ ...fileStore.current });
  }

  async function runWithFiles(rawCode, inputs) {
    let result;
    if (level?.files) {
      result = await cachedRunPythonReal(rawCode, fileStore.current, level.files.track || [], inputs || []);
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
  const [showHint, setShowHint] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testFailure, setTestFailure] = useState(null);
  const [resultInfo, setResultInfo] = useState(null);

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

  const runChecks = async () => {
    setTestFailure(null);
    setTesting(true);

    // NOTE: an eager `await ensurePyodide()` warm-up used to run here, forcing
    // every submit to download/initialize the ~20MB Pyodide wasm runtime even
    // when execution happens on the dev server. The Pyodide fallback path in
    // pythonRunnerReal.js loads it lazily if it is ever actually needed.

    const tracked = level?.files?.track || [];
    const snapshot = {};
    for (const name of tracked) {
      snapshot[name] = fileStore.current[name];
    }
    setFileEntriesBefore(snapshot);

    const startTime = performance.now();

    const lineCount = code
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length;

    const maxLines = level.maxLines ?? lineCount + 1;
    const maxTime = level.maxTime ?? 1;

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
          batch = await runPythonRealBatch(code, {}, [], inputSets);
        }
        if (DEV) {
          console.debug(`[submit] level="${level.name}" tests=${inputSets.length} mode=${batch ? "batch(1 process)" : "per-test"} elapsedMs=${Math.round(performance.now() - startTime)}`);
        }

        for (let ti = 0; ti < level.tests.length; ti++) {
          const test = level.tests[ti];
          const inputs = inputSets[ti];
          const output = batch ? batch.stdouts[ti] : await runWithFiles(code, inputs);
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
        const actualOutput = await runWithFiles(code, []);
        let expectedOutput = solutionCacheRef.current?.stdout;
        if (expectedOutput === undefined) {
          const result = await runCodeFrom((level.startingCode || "") + level.solution, { ...(level?.files?.initial || {}) }, []);
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

        const solutionCode = (level.startingCode || "") + level.solution;
        const actualOutput = await runWithFiles(code + "\nprint(" + varName + ")", inputs);
        const expectedOutput = await runWithFiles(solutionCode + "\nprint(" + varName + ")", inputs);

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
          const result = await runCodeFrom((level.startingCode || "") + level.solution, initialFiles, []);
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

      const fullSolution = (level.startingCode || "") + level.solution;
      const [actualOutput, expectedOutput] = await Promise.all([
        runWithFiles(code, []),
        runWithFiles(fullSolution, []),
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

  const handleHintToggle = () => {
    setShowHint((prev) => !prev);
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

  return (
    <>
      {showModal && (
        <CompletionModal
          level={level}
          stars={earnedStars}
          resultInfo={resultInfo}
          onRetry={() => {
            setShowModal(false);
            setShowHint(false);
          }}
          onContinue={() => {
            setShowModal(false);
            const nextLevel = chapter.levels[levelIndex + 1];
            if (nextLevel) {
              navigate(`/tracks/${trackName}/${chapterId}/${nextLevel.id}`);
            } else {
              navigate(`/tracks/${trackName}`);
            }
          }}
        />
      )}

      {gameOpen && <GameModal code={code} onClose={() => setGameOpen(false)} />}

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
                Test Failed
              </h2>

              {testFailure.input !== undefined && testFailure.input !== "" && (
                <div className="rounded-xl p-3 mb-3 text-left" style={{ background: "#1e1e2e" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "#9CA3AF" }}>INPUT</div>
                  <pre className="text-xs font-mono m-0" style={{ color: "#CDD6F4", whiteSpace: "pre-wrap" }}>{Array.isArray(testFailure.input) ? testFailure.input.join("\n") : testFailure.input}</pre>
                </div>
              )}

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
            </div>

            <div className="px-8 pb-8 pt-2 text-center shrink-0">
              <PixelButton onClick={() => setTestFailure(null)} size="md" variant="primary">
                Try Again
              </PixelButton>
            </div>
          </div>
        </div>
      )}

      <div key={levelId} className="lg:h-screen lg:overflow-hidden pt-24 pb-24 lg:pb-8 px-4 relative z-10">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(`/tracks/${trackName}`)}
            className="text-sm mb-6 flex items-center gap-1 hover:gap-2 transition-all"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft size={14} className="inline mr-1" /> {chapter.name}
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
            <div className="lg:col-span-3 lg:self-start">
              <div
                className="rounded-2xl p-5 lg:max-h-[calc(100vh-10rem)] flex flex-col"
                style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
              >
                <div>
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
                  <h2
                    className="text-xl font-black mb-3"
                    style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
                  >
                    {level.name}
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin" }}>
                  {isCompleted && currentStars > 0 && (
                  <div
                    className="rounded-xl p-3 mb-4 flex items-center justify-center gap-1"
                    style={{ background: "#E9B44C10", border: "1.5px solid #E9B44C40" }}
                  >
                    {[1, 2, 3].map((s) => (
                      <StarIcon key={s} filled={s <= currentStars} className="text-xl" />
                    ))}
                  </div>
                )}

                <div
                  className="rounded-xl p-4 mb-4"
                  style={{ background: "#6AAE6F10", border: "1.5px solid #6AAE6F30" }}
                >
                  <div
                    className="text-xs font-bold mb-2 uppercase tracking-wider"
                    style={{ color: "#6AAE6F" }}
                  >
                    <span className="inline-flex items-center gap-1.5"><Target size={13} strokeWidth={2.5} /> Objective</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text)" }}>
                    {level.objective.map((seg, i) =>
                      seg.type === "code" ? (
                        <code
                          key={i}
                          className="px-1.5 py-0.5 rounded text-xs font-mono"
                          style={{ background: "var(--bg)", color: "var(--text)" }}
                        >
                          {seg.value}
                        </code>
                      ) : (
                        <span key={i}>{seg.value}</span>
                      )
                    )}
                  </p>
                </div>

                {level.explanation && (
                  <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: "#7AA2F710", border: "1.5px solid #7AA2F740" }}
                  >
                    <div
                      className="text-xs font-bold mb-2"
                      style={{ color: "#7AA2F7" }}
                    >
                      <span className="inline-flex items-center gap-1.5"><BookOpen size={12} strokeWidth={2.5} /> EXPLANATION</span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      {level.explanation.map((seg, i) =>
                        seg.type === "code" ? (
                        <code
                          key={i}
                          className="px-1.5 py-0.5 rounded text-xs font-mono"
                          style={{ background: "var(--bg)", color: "var(--text)" }}
                        >
                          {seg.value}
                        </code>
                      ) : (
                        <span key={i}>{seg.value}</span>
                      ))}
                    </p>
                  </div>
                )}
                {!level.explanation && level.example && (
                  <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: "#6AAE6F10", border: "1.5px solid #6AAE6F30" }}
                  >
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

                {showHint ? (
                  <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: "#E9B44C10", border: "1.5px solid #E9B44C40" }}
                  >
                    <div
                      className="text-xs font-bold mb-2"
                      style={{ color: "#E9B44C" }}
                    >
                      <span className="inline-flex items-center gap-1.5"><Lightbulb size={12} strokeWidth={2.5} /> HINT</span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      {level.hint && level.hint.map((seg, i) =>
                        seg.type === "code" ? (
                        <code
                          key={i}
                          className="px-1.5 py-0.5 rounded text-xs font-mono"
                          style={{ background: "var(--bg)", color: "var(--text)" }}
                        >
                          {seg.value}
                        </code>
                      ) : (
                        <span key={i}>{seg.value}</span>
                      )
                    )}
                    </p>
                  </div>
                ) : null}

                </div>

                {/* Desktop action buttons, on mobile these move to the sticky bottom bar */}
                <div className="hidden lg:flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
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
                      {showHint ? "Hide Hint" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
                    </PixelButton>
                  )}

                </div>
              </div>
            </div>

            <div className="lg:col-span-6 lg:self-start">
              <CodeEditorContainer code={code} setCode={setCode} language={"Python"} files={level.files} fileEntries={fileEntries} fileStore={fileStore} onFileUpdate={syncFileStore} fileEntriesBefore={fileEntriesBefore} initialFileSnapshot={initialFileSnapshot} onRunOverride={level.game ? () => setGameOpen(true) : undefined} />

              <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
                Write your code above, then click Run to test or Submit to check your answer.
              </p>
            </div>

            <div className="lg:col-span-3 lg:self-start">
              {(() => {
                if (level?.viz) {
                  return (
                    <div className="flex flex-col gap-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
                      <div
                        className="rounded-2xl p-3 shrink-0"
                        style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
                      >
                        <div
                          className="text-xs lg:text-[10px] font-bold uppercase tracking-wider mb-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Progress
                        </div>
                        <ProgressBar value={progress} showLabel={false} />
                        <p className="text-xs lg:text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                          {completedCount}/{chapter.levels.length} · {totalStars} <Star size={9} strokeWidth={2.5} fill="currentColor" className="inline align-baseline" />
                        </p>
                      </div>
                      <div
                        className="rounded-2xl p-4 flex-1"
                        style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
                      >
                        <div
                          className="text-xs lg:text-[10px] font-bold uppercase tracking-wider mb-3"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Visualization
                        </div>
                        {createElement(getVisualization(level.viz), { code, level })}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto space-y-4">
                    <div
                      className="rounded-2xl p-5"
                      style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
                    >
                      <div
                        className="text-xs font-bold uppercase tracking-wider mb-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Chapter Progress
                      </div>
                      <ProgressBar value={progress} showLabel={false} />
                      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                        {completedCount} of {chapter.levels.length} levels complete
                      </p>

                      <div
                        className="mt-4 pt-4"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <div
                          className="text-xs font-bold uppercase tracking-wider mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Current Chapter
                        </div>
                        <div className="flex items-center gap-2">
                          <Icon src={chapter.chapterIcon} alt={chapter.name} size={28} color={diff.color} className="md:w-10.5! md:h-10.5!" />
                          <span
                            className="text-sm font-bold"
                            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
                          >
                            {chapter.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="rounded-2xl p-5"
                      style={{ background: "var(--bg-card)", border: "2px solid var(--border)" }}
                    >
                      <div
                        className="text-xs font-bold uppercase tracking-wider mb-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Total Stars
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-2xl font-black"
                          style={{ color: "#E9B44C", fontFamily: "'Courier New', monospace" }}
                        >
                          {totalStars}
                        </span>
                        <StarIcon filled className="text-lg" />
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        across {completedCount} completed levels
                      </p>
                    </div>
                  </div>
                );
              })()}
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
                  {showHint ? "Hide Hint" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
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
                  {showHint ? "Hide" : (<span className="inline-flex items-center gap-1.5"><Lightbulb size={13} strokeWidth={2.5} /> Hint</span>)}
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
