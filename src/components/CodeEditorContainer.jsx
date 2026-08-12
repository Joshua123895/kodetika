import { createElement, useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Monitor, Play, Table, Terminal } from "lucide-react";
import { runPython, runPythonWithIO } from "../utils/pythonRunner";
import { runPythonReal } from "../utils/pythonRunnerReal";
import { warmPyodideWorker } from "../utils/pyodideWorkerClient";
import { mergeFileStore } from "../utils/fileManager";
import useCodeMirror, { makeDynamicEditorTheme } from "../editor/useCodeMirror";
import FilePanel from "../editor/FilePanel";
import { useColors } from "../editor/colors";

// The pane below the editor is a console by default, and something else on the
// tracks that have no stdout: a rendered page, a captured console, a result
// grid. Keyed by the label so a caller picks both at once and they can never
// disagree.
const PREVIEW_ICONS = { PREVIEW: Monitor, CONSOLE: Terminal, RESULT: Table };

// A module constant, not a default `[]` in the parameter list: a fresh array
// every render would change the identity of everything memoised on it.
const EMPTY_TABS = [];

export default function CodeEditorContainer({ code, setCode, language, files, fileEntries = {}, fileStore: fileStoreRef, onFileUpdate, fileEntriesBefore = {}, initialFileSnapshot = {}, onRunOverride, transformSource, onStdout, virtualTabs = EMPTY_TABS, preview, previewLabel = "PREVIEW", previewBg = "#fff" }) {
  const c = useColors();
  const dynamicTheme = useMemo(() => makeDynamicEditorTheme(c), [c]);

  const inputRef = useRef(null);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [waitingInput, setWaitingInput] = useState(false);
  const [inputBuffer, setInputBuffer] = useState("");
  const [activeTab, setActiveTab] = useState("main.py");
  // Virtual tabs holding a result the student has not looked at yet. Without
  // this the backend tracks' `browser` tab is a feature you only find by
  // clicking a tab that looks inert, since the console answers the level too.
  const [unseen, setUnseen] = useState(EMPTY_TABS);
  const selectTab = useCallback((id) => {
    setActiveTab(id);
    setUnseen((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : prev));
  }, []);
  // The console used to claim "> Ready to run" while the Python runtime was
  // still downloading, so a slow first Run looked like the app had hung.
  const [pyReady, setPyReady] = useState(false);
  const pendingResolve = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    warmPyodideWorker()
      .then(() => alive && setPyReady(true))
      .catch(() => alive && setPyReady(true)); // don't strand the label if the boot fails
    return () => { alive = false; };
  }, []);
  const rawOutputRef = useRef("");
  const onFileUpdateRef = useRef(onFileUpdate);
  const [beforeSnapshot, setBeforeSnapshot] = useState({});

  // `language` is the badge text shown above the editor ("Python", "HTML").
  // Reusing it as the highlighter key keeps the two from disagreeing — a badge
  // that says HTML over a Python-highlighted buffer is worse than either alone.
  const { editorRef, viewRef } = useCodeMirror({
    code,
    setCode,
    isDark: c.isDark,
    dynamicTheme,
    language: String(language ?? "").toLowerCase(),
  });

  useEffect(() => {
    onFileUpdateRef.current = onFileUpdate;
  });

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    if (activeTab === "main.py" && viewRef.current) {
      viewRef.current.requestMeasure();
    }
  }, [activeTab, viewRef]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setOutput("");
    rawOutputRef.current = "";

    const view = viewRef.current;
    if (!view) { setRunning(false); return; }

    // Backend levels append a probe block to the source on Run, so what comes
    // back is the graded transcript plus a payload the browser tab renders.
    // `onStdout` peels the payload off and returns what the console should
    // show — which is the transcript, unchanged. Deliberately not reset when a
    // run starts: leaving the previous page up until the new one arrives is
    // what a browser does, and avoids a flash of empty pane on every Run.
    const publish = (stdout) => setOutput(onStdout ? onStdout(stdout) : stdout);

    // Backend levels hand in a transform that appends the level's requests, so
    // pressing Run shows the same responses grading will compare. Without it a
    // student would define three routes, press Run, and see a blank pane.
    const userCode = transformSource
      ? transformSource(view.state.doc.toString())
      : view.state.doc.toString();

    if (files) {
      // Every Run starts from the level's seed, never from the previous run's
      // output. Carrying the old result forward made "After" feed the next
      // "Before" invisibly: on an append level a second Run appended twice, and
      // the Before/After pair — which reads as one before→after transition —
      // silently described a different starting file than the one shown.
      const seed = files.initial ? { ...files.initial } : {};
      const snap = {};
      for (const name of files.track || []) {
        if (seed[name] !== undefined) snap[name] = seed[name];
      }
      setBeforeSnapshot(snap);
      const result = await runPythonReal(userCode, seed, files.track || []);
      if (result.files && Object.keys(result.files).length > 0 && fileStoreRef) {
        fileStoreRef.current = mergeFileStore(fileStoreRef.current, null, result.files);
        onFileUpdateRef.current?.();
      }
      publish(result.stdout || "");
    } else {
      const snap = {};
      for (const name of files?.track || []) {
        const val = (fileStoreRef?.current || {})[name];
        if (val !== undefined) snap[name] = val;
      }
      setBeforeSnapshot(snap);

      const onOutput = (text) => {
        rawOutputRef.current += text;
        publish(rawOutputRef.current);
      };

      const onInput = (resolve) => {
        pendingResolve.current = resolve;
        setWaitingInput(true);
      };

      // Streaming API unavailable on Vercel, use batch Pyodide instead. The
      // number of input() calls can't be known statically (e.g. a loop calling
      // input() N times), so rerun from scratch each time the script asks for
      // more input than we've collected so far, replacing (not appending to)
      // the displayed output since each rerun recomputes the full transcript.
      const runViaPyodide = async () => {
        let inputs = [];
        while (true) {
          const { stdout, needsInput } = await runPythonWithIO(userCode, inputs);
          rawOutputRef.current = stdout;
          publish(stdout);
          if (!needsInput) break;

          const value = await new Promise((resolve) => {
            pendingResolve.current = resolve;
            setWaitingInput(true);
          });
          inputs.push(value);
        }
      };

      // On production there is no streaming server, so skip the POST that would
      // just 405 in the console and go straight to Pyodide.
      if (import.meta.env.PROD) {
        await runViaPyodide();
      } else {
        try {
          await runPython(userCode, onInput, onOutput);
        } catch {
          await runViaPyodide();
        }
      }
    }

    // Flag every virtual tab the student is not currently looking at. The one
    // they are on is already showing the new result, so it is not news.
    setUnseen(virtualTabs.filter((t) => t.id !== activeTab).map((t) => t.id));
    setRunning(false);
  }, [files, fileStoreRef, viewRef, transformSource, onStdout, virtualTabs, activeTab]);

  const handleInputChange = (e) => setInputBuffer(e.target.value);

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && pendingResolve.current) {
      pendingResolve.current(inputBuffer);
      pendingResolve.current = null;
      setInputBuffer("");
      setWaitingInput(false);
    }
  };

  useEffect(() => {
    if (waitingInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingInput]);

  return (
    <div
      className="rounded-xl flex flex-col editor-wrapper"
      style={{
        border: `2px solid ${c.outerBorder}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        minHeight: "40dvh",
        maxHeight: "calc(100dvh - 10rem)",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-hidden"
        style={{ background: c.headerBg, borderTopLeftRadius: "0.75rem", borderTopRightRadius: "0.75rem" }}
      >
        <div className="flex gap-1.5 shrink-0">
          {["#FF5F57", "#FFBD2E", "#28CA41"].map((dot, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full"
              style={{ background: dot }}
            />
          ))}
        </div>
        <div className="flex-1" />
        <div
          className="text-xs px-2 py-0.5 rounded mr-2 min-w-0 truncate"
          style={{ background: c.languageBg, color: c.languageText }}
        >
          {language}
        </div>
        <button
          onClick={onRunOverride || handleRun}
          disabled={running && !onRunOverride}
          title={running ? "Running…" : "Run"}
          aria-label={running ? "Running" : "Run"}
          className="
            inline-flex items-center justify-center
            shrink-0
            px-2.5 py-1.5 rounded font-bold
            bg-[#6AAE6F]
            hover:brightness-110
            active:brightness-90
            active:scale-[0.98]
            disabled:cursor-not-allowed
          "
          style={{
            background: running ? c.runDisabledBg : "#6AAE6F",
            color: "#fff",
          }}
        >
          {running ? <Loader2 size={14} strokeWidth={3} className="animate-spin" /> : <Play size={14} strokeWidth={3} fill="currentColor" />}
        </button>
      </div>

      <FilePanel
        files={files}
        fileEntries={fileEntries}
        fileEntriesBefore={fileEntriesBefore}
        beforeSnapshot={beforeSnapshot}
        initialSnapshot={initialFileSnapshot}
        activeTab={activeTab}
        onTabChange={selectTab}
        isDark={c.isDark}
        dynamicTheme={dynamicTheme}
        c={c}
        virtualTabs={virtualTabs}
        unseenTabs={unseen}
      />

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ display: activeTab === "main.py" ? "" : "none", background: c.editorBg, touchAction: "manipulation" }}
      >
        <div
          ref={editorRef}
          className="flex-1"
          style={{ touchAction: "manipulation" }}
        />
      </div>

      <div
        className="flex items-center gap-2 px-4 py-1.5 shrink-0"
        style={{ background: c.consoleBg, borderTop: `1px solid ${c.tabBorder}` }}
      >
        <span
          className="text-xs font-bold"
          style={{ color: c.consoleLabel, fontFamily: "'Consolas', monospace" }}
        >
          {preview ? (
            <span className="inline-flex items-center gap-1.5">
              {createElement(PREVIEW_ICONS[previewLabel] ?? Monitor, { size: 11, strokeWidth: 2.5 })} {previewLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5"><Terminal size={11} strokeWidth={2.5} /> CONSOLE</span>
          )}
        </span>
      </div>

      {/* A web level has no stdout, so the pane below the editor shows the page
          itself instead of a console. It gets more room than the console does —
          220px of terminal is plenty, 220px of web page is a letterbox.
          A JavaScript level passes previewBg/previewLabel to turn the same pane
          back into a console, since its page is deliberately blank. */}
      {preview ? (
        <div
          className="shrink-0 overflow-hidden"
          style={{ background: previewBg, height: 260, borderBottomLeftRadius: "0.75rem", borderBottomRightRadius: "0.75rem" }}
        >
          {preview}
        </div>
      ) : (
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ background: c.consoleBg, minHeight: 80, maxHeight: 150, borderBottomLeftRadius: "0.75rem", borderBottomRightRadius: "0.75rem" }}
      >
        <div
          ref={outputRef}
          className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto flex-1"
          style={{ color: c.consoleText }}
        >
          {output || (waitingInput ? "" : running ? "Running..." : pyReady ? "> Ready to run" : "> Preparing Python…")}
        </div>
        {waitingInput && (
          <div
            className="flex items-center gap-1 px-4 py-2 border-t shrink-0"
            style={{ borderColor: c.tabBorder, background: c.consoleBg }}
          >
            <span className="text-xs font-mono" style={{ color: c.consoleLabel }}>
              &gt;
            </span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent border-none outline-none font-mono text-xs"
              style={{
                color: c.inputText,
                caretColor: c.caretColor,
              }}
              value={inputBuffer}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
            />
          </div>
        )}
      </div>
      )}
    </div>
  );
}
