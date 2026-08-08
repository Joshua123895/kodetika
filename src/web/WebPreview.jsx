import { useEffect, useState } from "react";
import { previewDocument } from "./webRuntime";

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
export default function WebPreview({ files, nonce = 0, debounce = 400, asConsole = false }) {
  const [doc, setDoc] = useState(() => previewDocument(files, { asConsole }));

  const serialized = JSON.stringify(files);
  useEffect(() => {
    const t = setTimeout(() => setDoc(previewDocument(JSON.parse(serialized), { asConsole })), debounce);
    return () => clearTimeout(t);
  }, [serialized, debounce, asConsole]);

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
