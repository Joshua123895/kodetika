// Runs Pyodide inside a Web Worker instead of the main thread. A synchronous
// infinite loop in student code (e.g. `while True: pass`) blocks whatever
// thread is running it with no way for JS to interrupt it from inside that
// same thread, so running on the main thread means a hung tab with no
// recovery but a hard reload. Isolating execution in a worker lets the client
// (pyodideWorkerClient.js) enforce a timeout by calling worker.terminate(),
// which kills the stuck interpreter outright.
import { loadPyodide } from "pyodide";

let pyodideInstance = null;
let pyodideLoading = null;

async function ensurePyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (!pyodideLoading) {
    pyodideLoading = loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
      fullStdLib: true,
      stdin: () => "",
    }).then((p) => {
      pyodideInstance = p;
      return p;
    });
  }
  return pyodideLoading;
}

function writeInitialFiles(pyodide, initialFiles) {
  for (const [name, content] of Object.entries(initialFiles || {})) {
    const parts = name.split("/");
    let path = "";
    for (let i = 0; i < parts.length - 1; i++) {
      path += "/" + parts[i];
      try { pyodide.FS.mkdir(path); } catch { /* exists */ }
    }
    pyodide.FS.writeFile("/" + name, content);
  }
}

function readTrackedFiles(pyodide, trackedFiles) {
  const files = {};
  for (const name of trackedFiles || []) {
    try {
      files[name] = pyodide.FS.readFile("/" + name, { encoding: "utf8" });
    } catch { /* file doesn't exist */ }
  }
  return files;
}

// `needsIOShim` mirrors runPythonWithIO's contract (raise a sentinel when the
// script asks for more input() values than we've supplied, so the caller can
// prompt the user and re-run from scratch) instead of runPythonReal's silent
// "" fallback, the two callers need different behavior on missing input.
function buildWrappedCode(code, inputs, needsIOShim) {
  if (needsIOShim) {
    return `
import sys, builtins
sys.stdout.reconfigure(write_through=True)
class _NeedMoreInput(BaseException):
    pass
_inputs = ${JSON.stringify(inputs || [])}
_input_index = 0
def _input(prompt=""):
    global _input_index
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    if _input_index >= len(_inputs):
        raise _NeedMoreInput()
    line = _inputs[_input_index]
    _input_index += 1
    sys.stdout.write(str(line) + "\\n")
    sys.stdout.flush()
    return line
builtins.input = _input
` + "\n" + code;
  }

  const inputShim = inputs && inputs.length > 0
    ? `import sys, builtins
sys.stdout.reconfigure(write_through=True)
_inputs = ${JSON.stringify(inputs)}
_input_index = 0
def _input(prompt=""):
    global _input_index
    if _input_index < len(_inputs):
        line = _inputs[_input_index]
        _input_index += 1
    else:
        line = ""
    return line
builtins.input = _input
`
    : `import sys
sys.stdout.reconfigure(write_through=True)
`;
  return inputShim + "\n" + code;
}

self.onmessage = async (e) => {
  const { id, code, initialFiles, trackedFiles, inputs, needsIOShim, warmup } = e.data;

  // Warm-up ping: just boot the interpreter and report back. Loading Pyodide is
  // a multi-second, ~20MB one-time cost, and it used to land inside the first
  // Run/Submit — where it counted against both the 8s timeout and the student's
  // execution-speed star. Doing it up front takes it off that critical path.
  if (warmup) {
    try {
      await ensurePyodide();
      self.postMessage({ id, ready: true });
    } catch (err) {
      self.postMessage({ id, fatalError: String(err) });
    }
    return;
  }

  try {
    const pyodide = await ensurePyodide();

    let stdout = "";
    pyodide.setStdout({ write: (buf) => { stdout += new TextDecoder().decode(buf); return buf.length; }, isatty: true });
    pyodide.setStderr({ write: (buf) => { stdout += new TextDecoder().decode(buf); return buf.length; }, isatty: true });

    writeInitialFiles(pyodide, initialFiles);

    let needsInput = false;
    try {
      await pyodide.runPythonAsync(buildWrappedCode(code, inputs, needsIOShim));
    } catch (err) {
      const msg = String(err);
      if (needsIOShim && msg.includes("_NeedMoreInput")) {
        needsInput = true;
      } else {
        const cleaned = msg.startsWith("PythonError: Traceback (most recent call last):")
          ? msg.trim().split("\n").at(-1).trim()
          : msg;
        if (!stdout.includes(cleaned)) stdout += "\n" + cleaned;
      }
    }

    const files = readTrackedFiles(pyodide, trackedFiles);
    self.postMessage({ id, stdout: stdout.replace(/\r\n/g, "\n"), files, needsInput });
  } catch (err) {
    self.postMessage({ id, fatalError: String(err) });
  }
};
