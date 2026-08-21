import { useEffect, useState } from "react";
import { previewDocument } from "./webRuntime";
import { useTheme } from "../context/ThemeContext";

// The live preview that replaces the console on a web level.
//
// Same sandbox as the grading frame — `allow-scripts` and nothing else, so a
// student's script cannot reach the parent page. It is intentionally NOT
// re-rendered on every keystroke: reloading an iframe mid-word is visually
// violent and, on a level with a script, would run half-typed code constantly.
// A short debounce settles it instead.
// `nonce` is the Run button. Changing it keys the iframe, which remounts it —
// a genuine reload, not a re-render. That matters because setting srcDoc to the
// string it already holds is a no-op, so on an unchanged document there would
// otherwise be no way to run a script a second time.
// The console palette, resolved to real values: the iframe is its own document
// and cannot see the page's CSS variables, so the variables are read out here
// and baked into the srcdoc. Falls back to the binary palettes when a variable
// is missing (tests render without index.css).
function consoleColors() {
  const s = getComputedStyle(document.documentElement);
  const bg = s.getPropertyValue("--editor-console-bg").trim();
  const fg = s.getPropertyValue("--editor-console-text").trim();
  return bg && fg ? { bg, fg, err: "#FF5F57" } : null;
}

export default function WebPreview({ files, nonce = 0, debounce = 400, asConsole = false }) {
  const { theme, dark } = useTheme();
  const [doc, setDoc] = useState(() => previewDocument(files, { asConsole, dark, colors: consoleColors() }));

  const serialized = JSON.stringify(files);
  useEffect(() => {
    const t = setTimeout(
      () => setDoc(previewDocument(JSON.parse(serialized), { asConsole, dark, colors: consoleColors() })),
      debounce
    );
    return () => clearTimeout(t);
  }, [serialized, debounce, asConsole, dark, theme]);

  return (
    <iframe
      key={nonce}
      title={asConsole ? "Console output" : "Page preview"}
      sandbox="allow-scripts"
      srcDoc={doc}
      className="w-full h-full border-0"
    />
  );
}
