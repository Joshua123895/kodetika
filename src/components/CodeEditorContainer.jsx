import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Play, Terminal } from "lucide-react";
import { runPython, runPythonWithIO } from "../utils/pythonRunner";
import { runPythonReal } from "../utils/pythonRunnerReal";
import { mergeFileStore } from "../utils/fileManager";
import { useTheme } from "../context/ThemeContext";
import useCodeMirror, { makeDynamicEditorTheme } from "../editor/useCodeMirror";
import FilePanel from "../editor/FilePanel";

function useColors() {
  const { dark } = useTheme();
  return {
    isDark: dark,
    outerBorder: dark ? "#374151" : "#D4D9CF",
    headerBg: dark ? "#1e1e2e" : "#F5F4EF",
    languageBg: "#6AAE6F20",
    languageText: "#6AAE6F",
    runDisabledBg: dark ? "#6B7280" : "#B7BDB2",
    tabBarBg: dark ? "#16162a" : "#ECEBE5",
    tabBorder: dark ? "#2a2b3d" : "#D8DDD3",
    tabActiveBg: dark ? "#1a1b2e" : "#FFFFFF",
    tabActiveText: dark ? "#CDD6F4" : "#2F3430",
    tabInactiveText: dark ? "#6B7280" : "#70766D",
    editorBg: dark ? "#1a1b2e" : "#FAF9F5",
    consoleBg: dark ? "#0d0e17" : "#EEF2EB",
    consoleText: dark ? "#CDD6F4" : "#374151",
    consoleLabel: dark ? "#6B7280" : "#7B8077",
    inputText: dark ? "#CDD6F4" : "#374151",
    selectionBg: dark ? "#334155" : "#B3D4FC",
    caretColor: "#6AAE6F",
  };
}

export default function CodeEditorContainer({ code, setCode, language, files, fileEntries = {}, fileStore: fileStoreRef, onFileUpdate, fileEntriesBefore = {}, initialFileSnapshot = {}, onRunOverride }) {
  const c = useColors();
  const dynamicTheme = useMemo(() => makeDynamicEditorTheme(c), [c.isDark]);

  const inputRef = useRef(null);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [waitingInput, setWaitingInput] = useState(false);
  const [inputBuffer, setInputBuffer] = useState("");
  const [activeTab, setActiveTab] = useState("main.py");
  const pendingResolve = useRef(null);
  const outputRef = useRef(null);
  const rawOutputRef = useRef("");
  const onFileUpdateRef = useRef(onFileUpdate);
  const [beforeSnapshot, setBeforeSnapshot] = useState({});

  const { editorRef, viewRef } = useCodeMirror({ code, setCode, isDark: c.isDark, dynamicTheme });

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
  }, [activeTab]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setOutput("");
    rawOutputRef.current = "";

    const view = viewRef.current;
    if (!view) { setRunning(false); return; }

    const userCode = view.state.doc.toString();

    if (files) {
      const snap = {};
      for (const name of files.track || []) {
        const val = (fileStoreRef?.current || {})[name];
        if (val !== undefined) snap[name] = val;
      }
      setBeforeSnapshot(snap);
      const result = await runPythonReal(userCode, fileStoreRef?.current || {}, files.track || []);
      if (result.files && Object.keys(result.files).length > 0 && fileStoreRef) {
        fileStoreRef.current = mergeFileStore(fileStoreRef.current, null, result.files);
        onFileUpdateRef.current?.();
      }
      setOutput(result.stdout || "");
    } else {
      const snap = {};
      for (const name of files?.track || []) {
        const val = (fileStoreRef?.current || {})[name];
        if (val !== undefined) snap[name] = val;
      }
      setBeforeSnapshot(snap);

      const onOutput = (text) => {
        rawOutputRef.current += text;
        setOutput(rawOutputRef.current);
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
          setOutput(stdout);
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

    setRunning(false);
  }, [files, fileStoreRef]);

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
        <div className="flex gap-1.5">
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
          className="text-xs px-2 py-0.5 rounded mr-2"
          style={{ background: c.languageBg, color: c.languageText }}
        >
          {language}
        </div>
        <button
          onClick={onRunOverride || handleRun}
          disabled={running && !onRunOverride}
          className="
            text-xs px-3 py-1 rounded font-bold
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
          {running ? <Loader2 size={13} strokeWidth={3} className="animate-spin" /> : (<><Play size={13} strokeWidth={3} fill="currentColor" /> Run</>)}
        </button>
      </div>

      <FilePanel
        files={files}
        fileEntries={fileEntries}
        fileEntriesBefore={fileEntriesBefore}
        beforeSnapshot={beforeSnapshot}
        initialSnapshot={initialFileSnapshot}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDark={c.isDark}
        dynamicTheme={dynamicTheme}
        c={c}
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
          <span className="inline-flex items-center gap-1.5"><Terminal size={11} strokeWidth={2.5} /> CONSOLE</span>
        </span>
      </div>
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ background: c.consoleBg, minHeight: 80, maxHeight: 150, borderBottomLeftRadius: "0.75rem", borderBottomRightRadius: "0.75rem" }}
      >
        <div
          ref={outputRef}
          className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto flex-1"
          style={{ color: c.consoleText }}
        >
          {output || (waitingInput ? "" : running ? "Running..." : "> Ready to run")}
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
    </div>
  );
}
