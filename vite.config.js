import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { exec, execSync, spawn } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

const WRAPPER_LINES = 15;

function cleanTraceback(text, tmpDir) {
  const escaped = tmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let result = text.replace(new RegExp(escaped + '[\\\\/]', 'g'), '');
  result = result.replace(/line \d+/g, (m) => {
    const n = parseInt(m.slice(5), 10) - WRAPPER_LINES;
    return 'line ' + (n >= 1 ? n : 1);
  });
  return result;
}

function findPython() {
  // execSync (not exec): async exec never throws synchronously, so the old
  // version always returned 'python' even when that command was broken.
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      execSync(`${cmd} --version`, { timeout: 2000, stdio: 'ignore' });
      return cmd;
    } catch { /* try next */ }
  }
  return null;
}

const runningProcesses = new Map();

// Python input wrappers, declared at MODULE scope on purpose: they are used by
// both /api/run-python-stream and /api/run-python. They previously lived inside
// the stream handler's closure, so /api/run-python threw
// "ReferenceError: quietInputWrapper is not defined" on every request, which
// the error path returned as a clean { stdout: "" } success.
const inputWrapper = `
import sys, builtins
_orig_input = builtins.input
def _input(prompt=""):
    if prompt:
        sys.stdout.write(prompt)
        sys.stdout.flush()
    sys.stderr.write("__INPUT_REQ__\\n")
    sys.stderr.flush()
    line = _orig_input()
    sys.stdout.write(line + "\\n")
    sys.stdout.flush()
    return line
builtins.input = _input
`;

const quietInputWrapper = `
import sys, builtins
_inputs = []
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
`;

// Batch driver: runs the user's code once per input-set inside a SINGLE Python
// process, instead of spawning one process per test. Each test gets a fresh
// module namespace and a fresh mocked input() (quiet semantics, same as
// quietInputWrapper). Code is compiled with filename "main.py" and no wrapper
// prefix, so traceback line numbers are already correct.
const batchDriver = `
import json, sys, io, os, builtins, traceback, time

with open("__batch__.json") as f:
    payload = json.load(f)

code = payload["code"]
batches = payload["batches"]
initial_files = payload.get("files") or {}

def write_initial_files():
    for name, content in initial_files.items():
        d = os.path.dirname(name)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(name, "w") as fh:
            fh.write(str(content))

results = []
timings = []
for inputs in batches:
    write_initial_files()
    it = iter([str(x) for x in inputs])
    builtins.input = lambda prompt="": next(it, "")
    buf = io.StringIO()
    real_stdout = sys.stdout
    sys.stdout = buf
    t0 = time.perf_counter()
    try:
        exec(compile(code, "main.py", "exec"), {"__name__": "__main__"})
        err = ""
    except SystemExit:
        err = ""
    except BaseException:
        err = traceback.format_exc()
    finally:
        elapsed = time.perf_counter() - t0
        sys.stdout = real_stdout
    out = buf.getvalue()
    if err:
        last = err.strip().split("\\n")[-1]
        out += ("" if (not out or out.endswith("\\n")) else "\\n") + last + "\\n"
    results.append(out)
    timings.append(elapsed)

sys.stdout.write("__BATCH_RESULTS__" + json.dumps({"stdouts": results, "timings": timings}))
`;

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    {
      name: 'python-runner',
      configureServer(server) {
        const pythonCmd = findPython();

        server.middlewares.use('/api/run-python-stream', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { code, initialFiles, trackedFiles, inputs } = JSON.parse(body);

              if (!pythonCmd) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Python not found.' }));
                return;
              }

              const streamId = randomBytes(8).toString('hex');
              const tmpDir = mkdtempSync(join(tmpdir(), 'kodetika-'));

              if (initialFiles) {
                for (const [name, content] of Object.entries(initialFiles)) {
                  const dir = join(tmpDir, name.split('/').slice(0, -1).join('/'));
                  if (dir !== tmpDir) {
                    try { mkdtempSync(dir); } catch { /* exists */ }
                  }
                  writeFileSync(join(tmpDir, name), content, 'utf-8');
                }
              }

              writeFileSync(join(tmpDir, 'main.py'), inputWrapper + '\n' + code, 'utf-8');

              const child = spawn(pythonCmd, ['main.py'], {
                cwd: tmpDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 15000,
              });

              const sseClients = new Set();
              let stdoutBuf = '';
              let stderrBuf = '';

              runningProcesses.set(streamId, {
                child,
                tmpDir,
                sseClients,
                trackedFiles: trackedFiles || [],
              });

              child.stdout.on('data', (data) => {
                const text = data.toString();
                stdoutBuf += text;
                for (const client of sseClients) {
                  client.write(`event: output\ndata: ${JSON.stringify(text)}\n\n`);
                }
              });

              child.stderr.on('data', (data) => {
                const text = cleanTraceback(data.toString(), tmpDir);
                if (text.includes('__INPUT_REQ__')) {
                  for (const client of sseClients) {
                    client.write(`event: input-request\ndata: ${JSON.stringify({ prompt: '' })}\n\n`);
                  }
                } else {
                  stderrBuf += text;
                  for (const client of sseClients) {
                    client.write(`event: output\ndata: ${JSON.stringify(text)}\n\n`);
                  }
                }
              });

              // A short, non-interactive script (print once and exit) can finish
              // before the frontend's SSE connection is even open: the client
              // has to await the POST above, parse the JSON, and only *then*
              // create the EventSource, a full extra round trip the child
              // process doesn't have to wait for. If `close` deletes the entry
              // immediately, that late connection 404s, EventSource fires
              // onerror, and runPython() resolves silently with no output at
              // all (see /api/run-python-events below for the read side of
              // this fix). So: keep the finished result around for a grace
              // period instead of deleting it right away.
              const finish = (result) => {
                const entry = runningProcesses.get(streamId);
                for (const client of sseClients) {
                  client.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
                  client.end();
                }
                entry.completed = true;
                entry.result = result;
                sseClients.clear();
                setTimeout(() => runningProcesses.delete(streamId), 30000);
                try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
              };

              child.on('close', (exitCode) => {
                const files = {};
                for (const name of (runningProcesses.get(streamId)?.trackedFiles || [])) {
                  try {
                    const filePath = join(tmpDir, name);
                    if (existsSync(filePath)) {
                      files[name] = readFileSync(filePath, 'utf-8');
                    }
                  } catch { /* skip */ }
                }
                finish({ exitCode, files, stdout: stdoutBuf, error: stderrBuf });
              });

              child.on('error', (err) => {
                finish({ exitCode: 1, files: {}, stdout: stdoutBuf, error: err.message });
              });

              if (inputs && inputs.length > 0) {
                child.stdin.write(inputs.join('\n'));
                child.stdin.end();
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ streamId }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });

        server.middlewares.use('/api/run-python-events', (req, res) => {
          const urlParts = req.url.split('/');
          const streamId = urlParts[urlParts.length - 1];

          const proc = runningProcesses.get(streamId);
          if (!proc) {
            res.statusCode = 404;
            res.end('Stream not found');
            return;
          }

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.flushHeaders();

          // The process may have already finished by the time this connects
          // (see the `finish` grace-period comment above), replay its
          // buffered output and the done event immediately instead of the
          // client waiting forever for events that already happened.
          if (proc.completed) {
            res.write('event: connected\ndata: {}\n\n');
            const replay = (proc.result.stdout || '') + (proc.result.error || '');
            if (replay) {
              res.write(`event: output\ndata: ${JSON.stringify(replay)}\n\n`);
            }
            res.write(`event: done\ndata: ${JSON.stringify(proc.result)}\n\n`);
            res.end();
            return;
          }

          res.write('event: connected\ndata: {}\n\n');
          proc.sseClients.add(res);

          req.on('close', () => {
            proc.sseClients.delete(res);
          });
        });

        server.middlewares.use('/api/run-python-input', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          const urlParts = req.url.split('/');
          const streamId = urlParts[urlParts.length - 1];

          const proc = runningProcesses.get(streamId);
          if (!proc) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Stream not found' }));
            return;
          }

          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { input } = JSON.parse(body);
              proc.child.stdin.write(input + '\n');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });

        server.middlewares.use('/api/run-python', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { code, initialFiles, trackedFiles, inputs, batchInputs } = JSON.parse(body);

              if (!pythonCmd) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Python not found.' }));
                return;
              }

              // Batch mode: run every test's input-set in ONE Python process
              // instead of one process per test (process spawn dominates cost,
              // especially on Windows).
              if (Array.isArray(batchInputs)) {
                const batchDir = mkdtempSync(join(tmpdir(), 'kodetika-batch-'));
                try {
                  writeFileSync(join(batchDir, '__batch__.json'),
                    JSON.stringify({ code, batches: batchInputs, files: initialFiles || {} }), 'utf-8');
                  writeFileSync(join(batchDir, 'run_batch.py'), batchDriver, 'utf-8');

                  const raw = await new Promise((resolve, reject) => {
                    exec(`${pythonCmd} run_batch.py`,
                      { cwd: batchDir, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
                      (err, out, errOut) => {
                        if (err && err.killed) {
                          reject(new Error('Execution timed out (10 second limit). Check for infinite loops or a blocking input().'));
                        } else if (err) {
                          reject(new Error(cleanTraceback(errOut || '', batchDir) || String(err.message || err)));
                        } else {
                          resolve(out || '');
                        }
                      });
                  });

                  const marker = raw.lastIndexOf('__BATCH_RESULTS__');
                  if (marker === -1) throw new Error('Batch driver produced no results.');
                  const parsed = JSON.parse(raw.slice(marker + '__BATCH_RESULTS__'.length));
                  const stdouts = parsed.stdouts;
                  const timings = parsed.timings;

                  const files = {};
                  if (trackedFiles) {
                    for (const name of trackedFiles) {
                      const filePath = join(batchDir, name);
                      if (existsSync(filePath)) files[name] = readFileSync(filePath, 'utf-8');
                    }
                  }

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ stdouts, timings, files }));
                } catch (e) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: e.message }));
                } finally {
                  try { rmSync(batchDir, { recursive: true, force: true }); } catch { /* cleanup */ }
                }
                return;
              }

              const tmpDir = mkdtempSync(join(tmpdir(), 'kodetika-'));
              let stdout = '';
              let stderr = '';

              try {
                if (initialFiles) {
                  for (const [name, content] of Object.entries(initialFiles)) {
                    const dir = join(tmpDir, name.split('/').slice(0, -1).join('/'));
                    if (dir !== tmpDir) {
                      try { mkdtempSync(dir); } catch { /* exists */ }
                    }
                    writeFileSync(join(tmpDir, name), content, 'utf-8');
                  }
                }

                const useQuiet = inputs && inputs.length > 0;
                const wrapper = useQuiet
                  ? quietInputWrapper.replace('_inputs = []', `_inputs = ${JSON.stringify(inputs)}`)
                  : inputWrapper;

                writeFileSync(join(tmpDir, 'main.py'), wrapper + '\n' + code, 'utf-8');

                await new Promise((resolve, reject) => {
                  const child = exec(
                    `${pythonCmd} main.py`,
                    { cwd: tmpDir, timeout: 10000, maxBuffer: 1024 * 1024 },
                    (err, out, errOut) => {
                      stdout = out || '';
                      stderr = cleanTraceback(errOut || '', tmpDir);
                      if (err && err.killed) {
                        // Old code resolved here, returning {stdout: ""} as a
                        // clean success, the user saw a wrong-answer with no
                        // output and no explanation.
                        stderr = stderr || 'Execution timed out (10 second limit). Check for infinite loops or a blocking input().';
                        stdout += '\n' + stderr;
                        reject(err);
                      } else if (err) {
                        if (!stderr) stderr = String(err.message || err);
                        stdout += '\n' + stderr;
                        reject(err);
                      } else {
                        resolve();
                      }
                    }
                  );

                  if (!useQuiet && inputs && inputs.length > 0) {
                    child.stdin.write(inputs.join('\n'));
                    child.stdin.end();
                  }
                });

                const files = {};
                if (trackedFiles) {
                  for (const name of trackedFiles) {
                    const filePath = join(tmpDir, name);
                    if (existsSync(filePath)) {
                      files[name] = readFileSync(filePath, 'utf-8');
                    }
                  }
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ stdout, files }));
              } catch (e) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ stdout: stdout || '', files: {}, error: stderr || e.message }));
              } finally {
                try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
              }
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        });
      },
    },
  ],
})
