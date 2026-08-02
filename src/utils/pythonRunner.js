import { runInPyodideWorker, TIMEOUT_MESSAGE } from "./pyodideWorkerClient";

// Runs `code` with the given already-known input values. If the script calls
// input() more times than there are values in `inputs`, execution stops early
// (via a sentinel exception) and `needsInput: true` is returned instead of
// silently feeding it "", the caller is expected to prompt for one more
// value, append it to `inputs`, and call this again (see CodeEditorContainer,
// which reruns from scratch each time to simulate a live console since Pyodide
// can't block synchronously on user input).
export async function runPythonWithIO(code, inputs = []) {
  try {
    const { stdout, needsInput } = await runInPyodideWorker(code, { inputs, needsIOShim: true });
    return { stdout, needsInput };
  } catch (workerErr) {
    if (workerErr.message === "TIMEOUT") {
      return { stdout: TIMEOUT_MESSAGE, needsInput: false };
    }
    return { stdout: `[runner error] ${workerErr.message}`, needsInput: false };
  }
}

export async function runPython(code, onInput, onOutput) {
  const streamRes = await fetch("/api/run-python-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!streamRes.ok) throw new Error("Streaming API unavailable");

  const { streamId } = await streamRes.json();

  return new Promise((resolve) => {
    const evtSource = new EventSource(`/api/run-python-events/${streamId}`);
    let resolved = false;

    evtSource.addEventListener("output", (e) => {
      const text = JSON.parse(e.data);
      if (onOutput) onOutput(text);
    });

    evtSource.addEventListener("input-request", (e) => {
      const { prompt } = JSON.parse(e.data);
      if (prompt && onOutput) onOutput(prompt);
      if (onInput) {
        onInput((value) => {
          fetch(`/api/run-python-input/${streamId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: value }),
          });
        });
      }
    });

    evtSource.addEventListener("done", () => {
      evtSource.close();
      if (!resolved) { resolved = true; resolve(); }
    });

    evtSource.onerror = () => {
      evtSource.close();
      if (!resolved) { resolved = true; resolve(); }
    };
  });
}
