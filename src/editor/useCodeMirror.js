import { useRef, useEffect } from "react";
import { basicSetup } from "codemirror";
import { EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import { EditorState, Compartment, Prec, RangeSetBuilder } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { indentUnit, HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { tags } from "@lezer/highlight";

const oneLightTheme = EditorView.theme({
  "&": { color: "#374151", backgroundColor: "#FAF9F5" },
  ".cm-content": { caretColor: "#6AAE6F" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6AAE6F" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#B3D4FC" },
  ".cm-panels": { backgroundColor: "#F5F4EF", color: "#374151" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid #D8DDD3" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #D8DDD3" },
  ".cm-searchMatch": { backgroundColor: "#B7D7FF55", outline: "1px solid #6AAE6F" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#D8ECD7" },
  ".cm-activeLine": { backgroundColor: "#F0F3ED" },
  ".cm-selectionMatch": { backgroundColor: "#D8ECD7" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "#D8ECD7", color: "#2F3430", fontWeight: "600" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "#FAD2D2", color: "#C0392B" },
  ".cm-foldPlaceholder": { backgroundColor: "#EEF2EB", border: "1px solid #D8DDD3", color: "#7B8077", borderRadius: "4px" },
  ".cm-tooltip": { border: "1px solid #D8DDD3", backgroundColor: "#FAF9F5", borderRadius: "8px" },
  ".cm-tooltip .cm-tooltip-arrow:before": { borderTopColor: "transparent", borderBottomColor: "transparent" },
  ".cm-tooltip .cm-tooltip-arrow:after": { borderTopColor: "#FAF9F5", borderBottomColor: "#FAF9F5" },
  ".cm-tooltip-autocomplete": { "& > ul > li[aria-selected]": { backgroundColor: "#D8ECD7", color: "#2F3430" } },
}, { dark: false });

const oneLightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#8B3FA5" },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#D65D4E" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#4F7EF7" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name), tags.atom, tags.bool], color: "#B7791F" },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#D48A12" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: "#0F7FAE" },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#5A9E58" },
  { tag: [tags.meta, tags.comment], color: "#98A29A", fontStyle: "italic" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#374151" },
  { tag: tags.heading, color: "#6AAE6F", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "#E05252" },
]);

const oneLight = [oneLightTheme, syntaxHighlighting(oneLightHighlight)];

// The grammar cannot tell a class from any other name. In `hero = Hero()` both
// sides are a plain `VariableName` to Lezer, so the two rendered identically and
// nothing on the line said which one was the type. Only `class Hero:` gets the
// className tag, and by then the student already knows.
//
// Python settles this by convention rather than syntax, so the convention is
// what we match: CapWords is a class, ALL_CAPS is a constant, everything else is
// a value. Requiring a lowercase letter is what separates the first from the
// second, and keeps `MAX_SIZE` from being painted as a type.
//
// Deliberately limited to `VariableName`. A `PropertyName` after a dot would
// catch `my.Thing()` correctly and `math.Pi` wrongly, and there is no way to
// tell those apart without knowing what the module holds.
const CAPWORDS = /^[A-Z][A-Za-z0-9_]*$/;
const classNameMark = Decoration.mark({ class: "cm-class-name" });

function classNameDecorations(view) {
  const builder = new RangeSetBuilder();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "VariableName") return;
        const text = view.state.doc.sliceString(node.from, node.to);
        if (!CAPWORDS.test(text) || !/[a-z]/.test(text)) return;
        builder.add(node.from, node.to, classNameMark);
      },
    });
  }
  return builder.finish();
}

export const classNameHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = classNameDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = classNameDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// Chalky in One Dark, the same gold the light theme already gives `typeName`,
// so a class reads as a type in both and never as a string.
//
// The nested selector is load-bearing. A mark decoration wraps the token span
// the highlighter already produced rather than replacing it, so on `Hero()` the
// inner span still carries the blue of a function call and, being the innermost
// element, wins the cascade. Styling the descendant too is what actually
// recolours the call, which is the case this whole feature exists for.
const classNameTheme = (isDark) =>
  EditorView.theme({
    ".cm-class-name, .cm-class-name span": { color: isDark ? "#E5C07B" : "#D48A12" },
  });

export function selectTheme(isDark) {
  return isDark ? [oneDark, classNameTheme(true)] : [oneLight, classNameTheme(false)];
}

/**
 * Turns the parser's own error nodes into red underlines, so a typo is visible
 * while it is being made rather than after pressing Run.
 *
 * Deliberately built on the syntax tree rather than on the real interpreter.
 * Every language in the editor gets this for free, it answers instantly with no
 * round trip, and it drags no runtime into a track that does not already have
 * one: a Pyodide-backed check would put a 20MB download behind an HTML level.
 *
 * The tradeoff is honest. This catches what the grammar can see, which is most
 * of what beginners actually type: unclosed brackets and quotes, a missing
 * colon, `while:` with no condition, a stray token, a forgotten comma. It does
 * not catch bad indentation, and it will never catch a NameError, because that
 * is not a syntax error at all. Running the code remains the authority.
 */
export function syntaxErrorMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return "Something looks missing here.";
  if (trimmed.length > 24) return "This does not look like valid code.";
  return `Unexpected \`${trimmed}\`.`;
}

export const syntaxLinter = linter(
  (view) => {
    const diagnostics = [];
    const doc = view.state.doc;
    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (!node.type.isError || diagnostics.length >= 20) return;
        // A zero-width error node marks a token the parser expected and did not
        // find, so there is nothing to underline at that spot. Widen it by one
        // character, staying inside the line, and drop it when even that is
        // empty: an underline on a blank line points at nothing.
        const line = doc.lineAt(node.from);
        const from = node.from === node.to ? Math.max(line.from, node.from - 1) : node.from;
        const to = node.from === node.to ? Math.min(line.to, node.to + 1) : node.to;
        if (from === to) return;
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: syntaxErrorMessage(doc.sliceString(from, to)),
        });
      },
    });
    return diagnostics;
  },
  // Long enough that a half-typed line is not underlined while the student is
  // still typing it, short enough to feel immediate once they stop.
  { delay: 500 }
);

export const baseEditorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", fontFamily: "'Consolas', monospace" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.6rem", overscrollBehavior: "none", WebkitOverflowScrolling: "touch" },
  ".cm-content": { padding: "16px 0" },
  ".cm-gutters": { fontFamily: "'Consolas', monospace", fontSize: "13px", paddingRight: "4px", borderRight: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
});

export function makeDynamicEditorTheme(c) {
  return EditorView.theme({
    ".cm-content": { caretColor: c.caretColor },
    ".cm-gutters": { backgroundColor: c.editorBg, color: c.tabInactiveText },
    ".cm-selectionBackground": { backgroundColor: `${c.selectionBg} !important` },
    "&.cm-focused .cm-cursor": { borderLeftColor: c.caretColor },
  });
}

const INDENT = "    ";

// Pure helper (no DOM) so the Tab / Shift-Tab behaviour can be unit-tested by
// applying the returned edit to an EditorState. Returns an update spec, or
// null when there's nothing to do (e.g. Shift-Tab on an already-flush line).
export function computeTabEdit(state, shiftKey) {
  const { from, to } = state.selection.main;
  const doc = state.doc;
  const startLine = doc.lineAt(from);
  const rawEndLine = doc.lineAt(to);
  // Whether the selection crosses a line boundary decides block vs. inline,
  // and it's decided *before* trimming the trailing line, so a selection that
  // happens to end at a line start is still a block operation, not a
  // replace-the-selection insert.
  const spansLines = rawEndLine.number > startLine.number;
  let endLineNum = rawEndLine.number;
  // A selection ending exactly at a line's start doesn't really include that
  // line (matches VS Code's block indent/dedent).
  if (spansLines && to === rawEndLine.from) endLineNum -= 1;

  if (shiftKey) {
    // Dedent: strip up to one indent unit (4 spaces or a tab) from each line.
    const changes = [];
    for (let ln = startLine.number; ln <= endLineNum; ln++) {
      const line = doc.line(ln);
      const m = line.text.match(/^(\t| {1,4})/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length });
    }
    return changes.length ? { changes } : null;
  }

  if (spansLines) {
    // Indent every line the selection touches (insert at each line start).
    const changes = [];
    for (let ln = startLine.number; ln <= endLineNum; ln++) {
      changes.push({ from: doc.line(ln).from, insert: INDENT });
    }
    return { changes };
  }

  // Single line (caret or inline selection): insert spaces at the cursor.
  return { changes: { from, to, insert: INDENT }, selection: { anchor: from + INDENT.length } };
}

export const tabHandler = EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return false;
    event.preventDefault();
    const edit = computeTabEdit(view.state, event.shiftKey);
    if (edit) view.dispatch(edit);
    return true;
  },
});

// Python is bundled; the web languages are not. Together they are ~250KB, which
// every Python student would otherwise download to highlight a track they may
// never open, so they load on demand and swap into the compartment when they
// arrive. `lang-html` already handles embedded <style> and <script>, so an HTML
// level gets CSS and JS highlighting inside it for free.
const LANGUAGE_LOADERS = {
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql({ dialect: m.SQLite })),
};

export default function useCodeMirror({ code, setCode, isDark, dynamicTheme, language, onRun, onSubmit }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const setCodeRef = useRef(setCode);
  const onRunRef = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);
  const compartmentRef = useRef(new Compartment());
  // The view is built once and reused as the student navigates between levels,
  // so the language cannot be a fixed extension: walking from a Python level
  // into a web one would leave HTML highlighted as Python. Its own compartment
  // lets it be swapped in place, the same way the theme already is.
  const languageCompartmentRef = useRef(new Compartment());

  useEffect(() => { setCodeRef.current = setCode; });
  useEffect(() => { onRunRef.current = onRun; });
  useEffect(() => { onSubmitRef.current = onSubmit; });

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) setCodeRef.current(update.state.doc.toString());
      });

      // Ctrl+Enter runs, Ctrl+Shift+Enter submits — reading through refs (not
      // the onRun/onSubmit params directly) so a level swap doesn't need this
      // extension reconfigured, the same trick updateListener uses above.
      // Prec.highest: basicSetup's defaultKeymap already binds Mod-Enter to
      // insertBlankLine, at the same default precedence tabHandler relies on.
      // Left unranked, that binding runs first and swallows the event (typing
      // a blank line instead of running), since it sits earlier in the
      // extensions array below.
      const runSubmitHandler = Prec.highest(EditorView.domEventHandlers({
        keydown: (event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return false;
          event.preventDefault();
          if (event.shiftKey) onSubmitRef.current?.();
          else onRunRef.current?.();
          return true;
        },
      }));

      viewRef.current = new EditorView({
        state: EditorState.create({
          doc: code,
          extensions: [
            basicSetup,
            EditorView.lineWrapping,
            tabHandler,
            runSubmitHandler,
            classNameHighlighter,
            syntaxLinter,
            languageCompartmentRef.current.of(python()),
            compartmentRef.current.of([selectTheme(isDark), dynamicTheme]),
            baseEditorTheme,
            indentUnit.of("    "),
            EditorState.tabSize.of(4),
            updateListener,
          ].flat(),
        }),
        parent: editorRef.current,
      });
    }

    return () => {
      if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({ effects: compartmentRef.current.reconfigure([selectTheme(isDark), dynamicTheme]) });
    }
  }, [isDark, dynamicTheme]);

  useEffect(() => {
    let cancelled = false;
    const apply = (extension) => {
      // `cancelled` matters because the import is async: navigating out of a web
      // level before the chunk lands must not paint HTML highlighting over the
      // Python level the student is now looking at.
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: languageCompartmentRef.current.reconfigure(extension),
      });
    };

    const load = LANGUAGE_LOADERS[language];
    if (load) load().then(apply).catch(() => {});
    else apply(python());

    return () => { cancelled = true; };
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const current = view.state.doc.toString();
      if (current !== code) view.dispatch({ changes: { from: 0, to: current.length, insert: code } });
    }
  }, [code]);

  return { editorRef, viewRef };
}
