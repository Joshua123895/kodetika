import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { BACKEND_LIBS } from "../src/backend/miniwebSource.js";

// miniweb is the framework the backend tracks hand the student from chapter 4
// onward. Every level in those chapters is graded by running the student's app
// through it, so a regression here breaks a whole track silently. These tests
// run the real file through real CPython — the same interpreter the level suite
// uses — rather than reasoning about it.

const MINIWEB_PATH = join(process.cwd(), "src/backend/miniweb.py");

let pythonCmd = null;
beforeAll(() => {
  for (const cmd of ["python", "python3", "py"]) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
      pythonCmd = cmd;
      return;
    } catch {
      // Not this interpreter — try the next candidate.
    }
  }
  throw new Error("Python not found. Install Python to run the miniweb tests.");
});

/** Runs `code` beside a seeded miniweb.py, returning stdout and stderr apart. */
function run(code) {
  const dir = mkdtempSync(join(tmpdir(), "sitc-miniweb-"));
  try {
    for (const [name, content] of Object.entries(BACKEND_LIBS.miniweb)) {
      writeFileSync(join(dir, name), content, "utf-8");
    }
    writeFileSync(join(dir, "main.py"), code, "utf-8");
    try {
      const stdout = execSync(`${pythonCmd} main.py`, {
        cwd: dir,
        timeout: 15000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, stderr: "", failed: false };
    } catch (e) {
      return { stdout: e.stdout || "", stderr: e.stderr || "", failed: true };
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A leftover temp dir is harmless; never fail a test over cleanup.
    }
  }
}

/** Builds a program that defines `body` then prints one line per call. */
function app(body, calls) {
  const printers = calls
    .map(
      (c) =>
        `r = c.${c.m || "get"}(${JSON.stringify(c.p)}${c.kw ? ", " + c.kw : ""})\n` +
        `print(r.status_code, "|", r.headers.get("Content-Type"), "|", r.text)`,
    )
    .join("\n");
  return `${body}\n\nc = app.test_client()\n${printers}\n`;
}

const BASE = `
from miniweb import MiniWeb, request, jsonify, abort, redirect, Response

app = MiniWeb()
NOTES = [{"id": 1, "text": "buy milk"}]

@app.get("/")
def home():
    return "Hello!"

@app.get("/notes")
def notes():
    return NOTES

@app.get("/notes/<int:id>")
def one(id):
    for n in NOTES:
        if n["id"] == id:
            return n
    abort(404)

@app.post("/notes")
def create():
    return {"text": (request.json or {}).get("text")}, 201

@app.get("/hello/<name>")
def hello(name):
    return "Hello, " + name + "!"

@app.get("/search")
def search():
    return request.args.get("q", "nothing")

@app.post("/subscribe")
def subscribe():
    return request.form.get("email", "none")

@app.get("/whoami")
def whoami():
    return request.headers.get("X-Client", "unknown")

@app.route("/echo", methods=("GET", "POST"))
def echo():
    return request.method + " " + request.path

@app.get("/why")
def why():
    abort(400, "q is required")

@app.get("/old")
def old():
    return redirect("/new", 301)

@app.get("/user")
def user():
    return jsonify({"name": "Ada"})

@app.get("/job")
def job():
    return "queued", 202, {"X-Job": "7"}

@app.get("/gone")
def gone():
    return "", 204
`;

describe("miniweb routing and responses", () => {
  let lines = [];
  beforeAll(() => {
    const result = run(
      app(BASE, [
        { p: "/" },
        { p: "/notes" },
        { p: "/notes/1" },
        { p: "/notes/9" },
        { p: "/notes/abc" },
        { p: "/missing" },
        { m: "post", p: "/notes", kw: 'json={"text": "hi"}' },
        { m: "put", p: "/notes" },
        { p: "/hello/Ada" },
        { p: "/search?q=cats" },
        { p: "/search" },
        { p: "/search?q=a&q=b" },
        { m: "post", p: "/subscribe", kw: 'data={"email": "a@b.c"}' },
        { p: "/whoami", kw: 'headers={"x-client": "curl"}' },
        { p: "/whoami" },
        { m: "post", p: "/echo" },
        { p: "/why" },
        { p: "/old" },
        { p: "/user" },
        { p: "/job" },
        { p: "/gone" },
      ]),
    );
    expect(result.stderr).toBe("");
    lines = result.stdout.trim().split(/\r?\n/);
  });

  const at = (i) => lines[i];

  it("answers a literal route as text", () => {
    expect(at(0)).toBe("200 | text/html; charset=utf-8 | Hello!");
  });

  it("turns a list or dict return into JSON", () => {
    expect(at(1)).toBe('200 | application/json | [{"id": 1, "text": "buy milk"}]');
    expect(at(2)).toBe('200 | application/json | {"id": 1, "text": "buy milk"}');
  });

  it("answers 404 for an aborted lookup and for an unknown path", () => {
    expect(at(3)).toBe('404 | application/json | {"error": "Not Found"}');
    expect(at(5)).toBe('404 | application/json | {"error": "Not Found"}');
  });

  it("does not let <int:> match something that is not a number", () => {
    expect(at(4)).toBe('404 | application/json | {"error": "Not Found"}');
  });

  it("accepts a JSON body and a (body, status) tuple", () => {
    expect(at(6)).toBe('201 | application/json | {"text": "hi"}');
  });

  it("answers 405 when the path matches but the method does not", () => {
    expect(at(7)).toBe('405 | application/json | {"error": "Method Not Allowed"}');
  });

  it("passes a captured segment to the handler", () => {
    expect(at(8)).toBe("200 | text/html; charset=utf-8 | Hello, Ada!");
  });

  it("reads query parameters, first value wins", () => {
    expect(at(9)).toBe("200 | text/html; charset=utf-8 | cats");
    expect(at(10)).toBe("200 | text/html; charset=utf-8 | nothing");
    expect(at(11)).toBe("200 | text/html; charset=utf-8 | a");
  });

  it("reads form fields", () => {
    expect(at(12)).toBe("200 | text/html; charset=utf-8 | a@b.c");
  });

  it("reads headers without caring about capitalisation", () => {
    expect(at(13)).toBe("200 | text/html; charset=utf-8 | curl");
    expect(at(14)).toBe("200 | text/html; charset=utf-8 | unknown");
  });

  it("serves one handler from several methods", () => {
    expect(at(15)).toBe("200 | text/html; charset=utf-8 | POST /echo");
  });

  it("carries an abort message into the body", () => {
    expect(at(16)).toBe('400 | application/json | {"error": "q is required"}');
  });

  it("redirects with a Location header", () => {
    expect(at(17)).toContain("301 |");
  });

  it("sets application/json from jsonify", () => {
    expect(at(18)).toBe('200 | application/json | {"name": "Ada"}');
  });

  it("accepts a (body, status, headers) tuple", () => {
    expect(at(19)).toBe("202 | text/html; charset=utf-8 | queued");
  });

  it("allows an empty body", () => {
    expect(at(20).trimEnd()).toBe("204 | text/html; charset=utf-8 |");
  });
});

describe("miniweb error behaviour", () => {
  it("turns a crashing handler into a 500 and logs one line to stdout, never stderr", () => {
    const result = run(`
from miniweb import MiniWeb
app = MiniWeb()

@app.get("/boom")
def boom():
    return 1 + "x"

c = app.test_client()
r = c.get("/boom")
print(r.status_code, r.text)
`);
    // The whole grading model depends on this: the suite compares stdout while
    // the browser merges stdout and stderr, so anything on stderr passes CI and
    // fails every student.
    expect(result.stderr).toBe("");
    expect(result.failed).toBe(false);
    const lines = result.stdout.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      '!! TypeError: unsupported operand type(s) for +: \'int\' and \'str\' in boom',
    );
    expect(lines[1]).toBe("500 Internal Server Error");
  });

  it("names the student's own handler when it forgets to return", () => {
    const result = run(`
from miniweb import MiniWeb
app = MiniWeb()

@app.get("/x")
def forgetful():
    "no return here"

c = app.test_client()
print(c.get("/x").status_code)
`);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("forgetful() returned nothing");
  });

  it("lets an errorhandler replace the default body and keep the status", () => {
    const result = run(`
from miniweb import MiniWeb, abort
app = MiniWeb()

@app.errorhandler(404)
def not_found(err):
    return {"error": "not found"}

c = app.test_client()
r = c.get("/nowhere")
print(r.status_code, r.text)
`);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe('404 {"error": "not found"}');
  });

  it("explains itself when request is touched outside a request", () => {
    const result = run(`
from miniweb import request
try:
    request.method
except RuntimeError as e:
    print("RuntimeError:", e)
`);
    expect(result.stdout).toContain("there is no request being handled right now");
  });
});

describe("miniweb as a WSGI application", () => {
  it("can be called with an environ and a start_response", () => {
    const result = run(`
import io
from miniweb import MiniWeb

app = MiniWeb()

@app.get("/hello/<name>")
def hello(name):
    return "Hello, " + name + "!"

captured = {}
def start_response(status, headers):
    captured["status"] = status
    captured["headers"] = dict(headers)

environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/hello/Grace", "QUERY_STRING": "", "wsgi.input": io.BytesIO(b"")}
body = app(environ, start_response)
print(captured["status"])
print(b"".join(body).decode())
print(captured["headers"]["Content-Length"])
`);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(["200 OK", "Hello, Grace!", "13"]);
  });
});

describe("miniweb ships safely", () => {
  it("is seeded from exactly the bytes on disk", () => {
    // The app seeds the ?raw import; the CPython suites seed this same registry.
    // If those two ever diverge, levels would grade against a different framework
    // than the student runs.
    expect(BACKEND_LIBS.miniweb["miniweb.py"]).toBe(readFileSync(MINIWEB_PATH, "utf-8"));
  });

  it("imports nothing that Pyodide cannot provide", () => {
    // Emscripten has no OS sockets, and asyncio.run collides with the loop that
    // pyodide.runPythonAsync is already inside. Catch either before it ships.
    const allowed = new Set(["io", "json", "re", "traceback", "http", "urllib.parse"]);
    const source = readFileSync(MINIWEB_PATH, "utf-8");
    const found = new Set();
    for (const line of source.split(/\r?\n/)) {
      const plain = line.match(/^import\s+([\w.]+)/);
      const from = line.match(/^from\s+([\w.]+)\s+import\s/);
      if (plain) found.add(plain[1]);
      if (from) found.add(from[1]);
    }
    expect(found.size).toBeGreaterThan(0);
    expect([...found].filter((m) => !allowed.has(m))).toEqual([]);
  });
});
