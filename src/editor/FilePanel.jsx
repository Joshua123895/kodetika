import { useRef, useEffect, useMemo } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { selectTheme, baseEditorTheme } from "./useCodeMirror";

const fileViewerThemeCompartment = new Compartment();

function resolveContent(tabId, fileEntries, fileEntriesBefore, beforeSnapshot, initialSnapshot) {
  if (tabId.endsWith(" (Before)")) {
    const realName = tabId.slice(0, -9);
    return fileEntriesBefore[realName] ?? beforeSnapshot[realName] ?? initialSnapshot[realName] ?? "";
  }
  if (tabId.endsWith(" (After)")) {
    const realName = tabId.slice(0, -8);
    return fileEntries[realName] ?? fileEntriesBefore[realName] ?? "";
  }
  return fileEntries[tabId] ?? fileEntriesBefore[tabId] ?? "";
}

function getRealName(tabId) {
  if (tabId.endsWith(" (Before)")) return tabId.slice(0, -9);
  if (tabId.endsWith(" (After)")) return tabId.slice(0, -8);
  return tabId;
}

function buildTabs(files, fileEntries) {
  const trackedFiles = files?.track || [];
  const allTabs = [];
  for (const name of trackedFiles) {
    if (name !== "main.py") {
      allTabs.push(`${name} (Before)`, `${name} (After)`);
    }
  }
  for (const name of Object.keys(fileEntries)) {
    if (name !== "main.py" && !trackedFiles.includes(name) && !allTabs.includes(name)) {
      allTabs.push(name);
    }
  }
  return allTabs;
}

// A tab that is not backed by a file at all — the backend tracks' rendered
// browser. It sits in the same bar as `miniweb.py` because that is where a
// student looks for "the other thing in this project", but its body is a React
// node rather than a read-only editor.
export default function FilePanel({ files, fileEntries, fileEntriesBefore, beforeSnapshot, initialSnapshot, activeTab, onTabChange, isDark, dynamicTheme, c, virtualTabs = [], unseenTabs = [] }) {
  const fileViewerRef = useRef(null);
  const fileViewerInnerRef = useRef(null);
  const fileViewInstance = useRef(null);
  const allTabs = useMemo(() => buildTabs(files, fileEntries), [files, fileEntries]);
  const virtual = virtualTabs.find((t) => t.id === activeTab);
  const isVirtual = Boolean(virtual);

  useEffect(() => {
    if (activeTab !== "main.py" && !isVirtual && fileViewerInnerRef.current) {
      const content = resolveContent(activeTab, fileEntries, fileEntriesBefore, beforeSnapshot, initialSnapshot);
      const isPy = getRealName(activeTab).endsWith(".py");

      if (!fileViewInstance.current) {
        fileViewInstance.current = new EditorView({
          state: EditorState.create({
            doc: content,
            extensions: [
              basicSetup,
              EditorView.lineWrapping,
              ...(isPy ? [python()] : []),
              fileViewerThemeCompartment.of([selectTheme(isDark), dynamicTheme]),
              baseEditorTheme,
              EditorView.editable.of(false),
              indentUnit.of("    "),
              EditorState.tabSize.of(4),
            ].flat(),
          }),
          parent: fileViewerInnerRef.current,
        });
        fileViewInstance.current.requestMeasure();
      } else {
        const current = fileViewInstance.current.state.doc.toString();
        if (current !== content) {
          fileViewInstance.current.dispatch({ changes: { from: 0, to: current.length, insert: content } });
        }
      }
    }
  }, [activeTab, isVirtual, fileEntries, fileEntriesBefore, beforeSnapshot, initialSnapshot, isDark, dynamicTheme]);

  useEffect(() => {
    if (fileViewInstance.current) {
      fileViewInstance.current.dispatch({ effects: fileViewerThemeCompartment.reconfigure([selectTheme(isDark), dynamicTheme]) });
    }
  }, [isDark, dynamicTheme]);

  useEffect(() => () => {
    if (fileViewInstance.current) { fileViewInstance.current.destroy(); fileViewInstance.current = null; }
  }, []);

  if ((!files || allTabs.length === 0) && virtualTabs.length === 0) return null;

  return (
    <>
      <div
        className="flex shrink-0 overflow-x-auto"
        style={{ background: c.tabBarBg, borderBottom: `1px solid ${c.tabBorder}` }}
      >
        <button
          onClick={() => onTabChange("main.py")}
          className="text-xs px-4 py-2.5 font-mono border-r whitespace-nowrap"
          style={{
            background: activeTab === "main.py" ? c.tabActiveBg : "transparent",
            color: activeTab === "main.py" ? c.tabActiveText : c.tabInactiveText,
            borderColor: c.tabBorder,
            borderBottom: activeTab === "main.py" ? "2px solid #6AAE6F" : "2px solid transparent",
          }}
        >
          main.py
        </button>
        {allTabs.map((name) => {
          const isBefore = name.endsWith(" (Before)");
          const isAfter = name.endsWith(" (After)");
          const accentColor = isBefore ? "#7AA2F7" : isAfter ? "#6AAE6F" : "#E9B44C";
          return (
            <button
              key={name}
              onClick={() => onTabChange(name)}
              className="text-xs px-4 py-2.5 font-mono border-r whitespace-nowrap"
              style={{
                background: activeTab === name ? c.tabActiveBg : "transparent",
                color: activeTab === name ? c.tabActiveText : c.tabInactiveText,
                borderColor: c.tabBorder,
                borderBottom: activeTab === name ? `2px solid ${accentColor}` : "2px solid transparent",
              }}
            >
              {name}
            </button>
          );
        })}
        {virtualTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="text-xs px-4 py-2.5 font-mono border-r whitespace-nowrap inline-flex items-center gap-1.5"
            style={{
              background: activeTab === tab.id ? c.tabActiveBg : "transparent",
              color: activeTab === tab.id ? c.tabActiveText : c.tabInactiveText,
              borderColor: c.tabBorder,
              borderBottom: activeTab === tab.id ? `2px solid ${tab.accent ?? "#7AA2F7"}` : "2px solid transparent",
            }}
          >
            {tab.icon}
            {tab.label}
            {/* A run landed while the student was elsewhere. Cleared the moment
                they open the tab, so it never nags about something they saw. */}
            {unseenTabs.includes(tab.id) && activeTab !== tab.id && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: tab.accent ?? "#7AA2F7" }}
                aria-label="new"
              />
            )}
          </button>
        ))}
      </div>
      <div
        ref={fileViewerRef}
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ display: activeTab !== "main.py" && !isVirtual ? "" : "none", background: c.editorBg, touchAction: "manipulation" }}
      >
        <div
          ref={fileViewerInnerRef}
          className="flex-1"
          style={{ touchAction: "manipulation" }}
        />
      </div>
      {/* Mounted only while selected. A hidden iframe still lays out at zero
          width, and the rendered page would come back sized for nothing. */}
      {virtual && (
        <div className="flex min-h-0 flex-1 overflow-hidden" style={{ background: c.editorBg }}>
          {virtual.node}
        </div>
      )}
    </>
  );
}
