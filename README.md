# Kodetika

An open, beginner-friendly platform for learning to code in the browser — nine
Python tracks, three on the web platform itself, one on SQL, and a full-stack
capstone that joins them. It is completely free, and you can start immediately —
no sign-up, no install, no local Python.

You write code in a real editor, run it against test cases, and earn stars for
getting it right, keeping it short, and keeping it fast. Many levels come with a
visualization that animates **your own code as it actually runs**, and the Game
Development track lets you build playable games on a canvas.

## Tracks

**745 levels across 14 tracks and 100 chapters.**

| Track | Difficulty | Chapters | Levels |
|-------|-----------|----------|--------|
| Python Fundamentals | Beginner | 12 | 100 |
| Python Beyond | Intermediate | 8 | 78 |
| Object-Oriented Programming | Intermediate | 8 | 72 |
| Data Structures | Intermediate | 9 | 55 |
| Algorithm Design & Patterns | Advanced | 11 | 60 |
| Game Development | Advanced | 7 | 46 |
| Machine Learning | Advanced | 16 | 76 |
| Backend Basics | Intermediate | 5 | 40 |
| APIs and Databases | Advanced | 5 | 38 |
| HTML & CSS | Beginner | 3 | 30 |
| JavaScript | Beginner | 4 | 40 |
| JavaScript Beyond | Intermediate | 4 | 40 |
| SQL | Beginner | 3 | 30 |
| Web Developer | Advanced | 5 | 40 |

Machine Learning implements every algorithm by hand in pure Python — no numpy,
no scikit-learn — from gradient descent up to a neural network that learns XOR
and a Q-learning agent.

HTML & CSS, JavaScript and JavaScript Beyond are the non-Python tracks, and they
share one runtime. On an HTML or CSS level the page renders live beside the
editor and grading inspects the DOM you built; on a JavaScript level the same
pane becomes a console and grading compares what you printed. Half the
JavaScript levels hand you a page you didn't write and ask you to change it —
click, keystroke and form included. JavaScript Beyond then takes the language
itself further: closures, the modern syntax real codebases are written in,
classes and errors, and finally promises, `async`/`await` and `fetch`, where a
level's own page supplies the API its code calls. See
[Web levels](#web-levels).

SQL runs on real SQLite, compiled to WebAssembly and running in a worker beside
Pyodide. Every level in the track queries the same small library database, the
pane beside the editor becomes a result table, and your answer is graded against
the level's own answer executed live in a second, identical database. See
[SQL levels](#sql-levels).

Backend Basics and APIs and Databases are the server side. They start by taking
an HTTP request apart with nothing but string methods, then have you build a
router out of a dictionary and a decorator — and only then hand you `miniweb`, a
small framework deliberately shaped like Flask whose entire source sits open in a
tab beside your code, because you just wrote most of it. From there the levels
stop printing: you register routes, and the grader makes real requests to your
app and shows you the responses. APIs and Databases carries that through a full
REST resource, a real SQLite database behind the routes, validation and token
checks, and finally the WSGI application underneath it all. See
[Backend levels](#backend-levels).

Web Developer is the capstone, and the only track where both halves are yours at
once. Your Python serves the page; the page's own script calls the JSON API your
Python also serves; and what the browser finally draws is what gets graded. It
runs exactly as a backend level does — same `miniweb`, same request driver — and
then one of the responses is rendered as a page and checked with the same DOM
assertions the HTML track uses. The last two chapters are cookies and sessions,
then the parts nobody demos: a health check, a cache header, a counter that
belongs to the process, and a 404 answer for the request nobody planned for. See
[Full-stack levels](#full-stack-levels).

## Features

- **No sign-up required.** An optional account syncs progress across devices;
  without one, everything is stored locally and works exactly the same.
- **Runs entirely in your browser.** Python executes via Pyodide (WebAssembly) in
  a Web Worker, so there is no server to wait on and an infinite loop can't
  freeze the page. SQL runs the same way, on real SQLite compiled to Wasm.
- **22 live visualizations** that trace your real execution — sorting, graphs,
  recursion, gradient descent, k-means, neural networks, and more.
- **Playable games.** The Game Development track runs your code against a pygame
  shim drawing to an HTML5 canvas, ending in Pong, Breakout, Snake, and a free
  build sandbox.
- **Chapters unlock in order.** A chapter opens once you finish the last level of
  the one before it, so the curriculum stays in sequence. A chapter you have
  already made progress in always stays open.
- **An Arcade** built from the level content itself — Guess the Output, Bug Hunt
  (find the one broken line), and Speed Typing, plus the Mini Project games
  playable standalone. High scores are local and sync to an account.
- Auto-saved drafts, star grading, hints, and step-by-step explanations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| Editor | CodeMirror 6 |
| Python Runtime | Pyodide 0.29 (in-browser) |
| SQL Runtime | sql.js — SQLite 3 compiled to WebAssembly |
| Auth & Sync | Supabase (optional) |
| Icons | lucide-react |
| Testing | Vitest |
| Linting | ESLint |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm
- Python 3 on your PATH — only needed to run the test suite, which validates
  every level's solution against real CPython

### Installation

```bash
git clone https://github.com/Joshua123895/Step-Into-Code.git
cd Step-Into-Code
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Other Scripts

```bash
npm run build      # production build
npm run preview    # preview the production build
npm run lint       # ESLint
npm test           # run the full test suite
npm run test:watch # tests in watch mode
```

### Environment Variables (optional)

Accounts and cross-device sync are powered by Supabase. Create a `.env.local`:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If these are missing the Supabase client is `null` and the app falls back to
localStorage-only progress — everything still works, you just can't sign in. The
anon key is safe to ship in the browser bundle; the database is protected by Row
Level Security.

One more, for whoever is building the site rather than learning from it:

```bash
VITE_ADMIN_EMAILS=you@example.com,someone@example.com
```

Signing in with a listed address opens every chapter without playing through the
ones before it, and adds a **Reset progress** control to the account menu (one
track or all of them, clearing both localStorage and the cloud row — see
`src/lib/admin.js`). Note that Vite inlines every `VITE_` variable into the
shipped bundle, so these addresses are readable by anyone who opens the
JavaScript. That is fine here because admin gates nothing but convenience; do not
grow it into anything that guards real data, which belongs in an RLS policy.

## Project Structure

```
Step-Into-Code/
├── public/                  # Static assets
├── src/
│   ├── assets/              # SVG icons, sounds
│   ├── backend/             # miniweb.py, the browser tab, and the fetch bridge
│   ├── components/          # Shared UI
│   ├── context/             # Auth, Progress, Theme providers
│   ├── data/
│   │   ├── tracks.js        # YAML loading + normalization
│   │   ├── levelSource.js   # "the program a solution is" + the request driver
│   │   ├── tracks/          # python1-9, web1-3, webdev — all level content
│   │   └── webAssert.js     # DOM assertion engine for web levels
│   ├── editor/              # CodeMirror setup
│   ├── game/                # pygame shim + game modal
│   ├── sql/                 # SQLite worker, grader, result table
│   ├── web/                 # sandboxed page runner + live preview
│   ├── hooks/
│   ├── lib/                 # Supabase client, saved-code sync, arcade scores
│   ├── pages/               # Landing, Track, Chapter, Level, Arcade, 404
│   ├── utils/               # Output matching, validators, Pyodide worker,
│   │                        #   chapter unlock rules
│   └── visualizations/      # 22 viz components + their trace harnesses
├── scripts/                 # Content maintenance (star budgets, Bug Hunt deck)
├── tests/                   # Vitest suites
└── vercel.json              # SPA catch-all rewrite
```

## Adding Levels

Level content lives in `src/data/tracks/*.yaml`. A minimal level:

```yaml
- name: Summary Statistics
  obj: 'Print the mean of `values`, rounded to 2 decimals.'
  expl: 'The mean is the sum divided by the count.'
  hint: 'Use `sum()` and `len()`.'
  max: '5/2'
  start: |
    values = [3, 1, 4, 1, 5]
  sol: |
    values = [3, 1, 4, 1, 5]
    print(round(sum(values) / len(values), 2))
  tests:
    - exp: |
        2.8
```

Three rules matter:

1. **Never hand-write expected output.** Grading compares exact normalized
   strings. Run the solution and capture what it actually prints — the test
   suite executes every `sol` against real Python on each run and will catch you.
2. **Keep `obj` and `expl` separate.** `obj` is the task, `expl` is the concept.
   Don't merge them.
3. **`max:` must be reachable by your own `sol`.** The numerator is the line
   budget for the second star, counted as non-empty lines. Set it below what the
   solution needs and nobody can ever earn that star. `npm test` fails if you do;
   `node scripts/star-budgets.mjs` reports, and `--fix` raises the broken ones.

### Web levels

A level marked `web: true` is graded on the page it renders instead of on
printed output, so it declares an `expect:` block rather than `tests:`:

```yaml
- name: Making a Link
  obj: 'Add an `a` element reading `Read the docs` that links to `https://developer.mozilla.org`.'
  max: '3/1'
  web: true
  start: |
    <!-- Add your link below -->
  sol: |
    <a href="https://developer.mozilla.org">Read the docs</a>
  expect:
    - sel: a
      text: 'Read the docs'
      attr:
        href: 'https://developer.mozilla.org'
```

Each rule needs a `sel` (a CSS selector) plus any of `count`, `text`,
`contains`, `attr`, `style`, and `msg` to override the generated message.
Whitespace in `text` is squashed, so a beginner's indentation never fails a
correct answer, and colours compare equal across `red` / `#ff0000` /
`rgb(255, 0, 0)` — jsdom echoes back what you wrote while a browser resolves it.

**Not every CSS property can be asserted on.** jsdom and Chrome compute
different strings for a few of them, so a level using one passes CI and fails
the student — silently, and only for them. `isGradableStyle` rejects the known
cases and `tests/webLevels.test.js` fails the build if a level declares one:

| Don't assert | Why | Use instead |
|--------------|-----|-------------|
| `border-width`, `border` | Chrome reports the *used* width, snapped to device pixels — `2px` came back as `1.6px` at 80% page zoom | `border-style` + `border-color` + `border-radius` |
| `width`, `height` | also used values — `50%` read back as `392px`, a number that depends on the width of the preview pane | `max-width`, reported as specified in both |
| `margin: 0 auto` | `margin-left` stays `auto` in jsdom and came back as `92px` in Chrome | teach it, don't check it — assert the `max-width` beside it |
| `background`, `box-shadow`, `text-decoration` | Chrome expands each to its longhand form | `background-color`, `text-decoration-line`; don't assert shadows |
| `row-gap`, `column-gap` | jsdom doesn't expand the `gap` shorthand into them, so they read `normal` there and `16px` in Chrome | assert `gap` — a student who writes the longhands still passes, since Chrome expands in the other direction |
| `line-height: 1.6` | unitless stays `1.6` in jsdom, resolves to `25.6px` in Chrome | give it a unit |
| `color: crimson` | only the twenty most common keywords are normalized; the rest stay keywords in jsdom and resolve to `rgb()` in Chrome | write the hex — a student typing the keyword still passes, since it's the *computed* value that gets normalized |

The pattern behind most of these is that a browser's `getComputedStyle` returns
the value layout settled on, while jsdom — which has no layout engine — can only
repeat what was declared. When in doubt, probe both before writing the level.

`font-weight: bold` is handled for you: Chrome computes it to `700`, and the
engine maps the keyword per-property so `normal` isn't rewritten on `font-style`.

The page renders in an iframe sandboxed to `allow-scripts` and nothing else. The
opaque origin that gives it is the point: a student's script cannot reach
`parent.localStorage` and wipe their own progress. Because the parent then can't
read the frame either, the assertions are injected into it and the verdict comes
back over `postMessage`.

#### JavaScript levels

`web: js` instead of `web: true` means the editor holds a *script* rather than a
document — it is fed in as `script.js`, the preview pane becomes a console, and
the level is graded on what it printed using the same `tests:` block and the same
`checkOutput` as the Python tracks:

```yaml
- name: Repeating Yourself
  obj: 'Print the numbers 1 to 5, one per line, using a `for` loop.'
  max: '3/1'
  web: js
  sol: |
    for (let i = 1; i <= 5; i++) {
      console.log(i);
    }
  tests:
    - exp: |
        1
        2
        3
        4
        5
  checks:
    has:
      - 'for\s*\('
    msg: 'Use a `for` loop — five `console.log` lines would not survive 1 to 500.'
```

`console.log` is captured with a formatter fixed in `CONSOLE_CAPTURE`, because it
is also the rule a student has to predict: strings print unquoted, arrays and
objects as JSON, everything else as `String(v)`, arguments joined by one space.

`checks:` matters more here than on a page level — output alone cannot tell a
`for` loop from someone who worked the answer out and typed it into a
`console.log`. Only the regex forms (`has:` / `no:`) are allowed: the others are
implemented by parsing the source with Python's `ast`, which would boot a 20MB
interpreter to be told that JavaScript is a SyntaxError. The suite enforces both
that restriction and that every `has:` pattern matches the level's own solution.

#### DOM levels

A `web: js` level that also carries a `page:` is a DOM level: that markup is the
document, your script runs beside it, and grading checks the page your script
left behind rather than what it printed. The pane shows the rendered page.

```yaml
- name: Reacting to a Click
  obj: 'When the button is clicked, the paragraph should read `Hello!`.'
  max: '4/1'
  web: js
  page: |
    <button id="go">Say hello</button>
    <p id="out">Nothing yet</p>
  sol: |
    let button = document.querySelector("#go");
    button.addEventListener("click", function () {
      document.querySelector("#out").textContent = "Hello!";
    });
  act:
    - sel: '#go'
  expect:
    - sel: '#out'
      text: 'Hello!'
  checks:
    has:
      - 'addEventListener'
    msg: 'The paragraph has to change *because* of the click.'
```

`act:` is what makes events gradable. A page checked as it loads has not been
interacted with, so the steps run first: `type: 'Ada'` fills an input and fires
`input` then `change`, anything else dispatches a `click` (or whatever `event:`
names), always bubbling. Only then do the `expect:` rules run.

The markup is the level's, not the student's — it stays out of the editor,
because the skill is reaching into a document you did not write, and a student
who can edit the page can edit the answer into it. Two rules the suite enforces:
a `web: js` level with `expect:` must supply a `page:`, and every `act:` selector
must exist on it. And since setting the text directly satisfies the same
assertions a listener would, event levels need a `checks:` block as well.

Three rules specific to all web levels:

1. **Don't assert on layout.** `tests/webLevels.test.js` grades in jsdom, which
   has no layout engine. Structure, text, attributes and declared style
   properties are real; widths, positions and "is it centred" are not.
2. **The starter must not already pass.** The suite checks this, because a level
   whose `start:` satisfies its own `expect:` hands out three stars for pressing
   Submit.
3. **Never hand-write expected output**, same as Python. `tests/webLevels.test.js`
   executes every web solution and compares — CPython is the authority there, a
   real DOM and the shared console formatter are the authority here. Web levels
   are excluded from the CPython corpus in `tests/levelSource.test.js`, and from
   the Arcade's Guess the Output pool, whose distractors are Python-shaped.

### SQL levels

A level marked `sql: true` is graded on the rows its query returns. There is no
`tests:` and no `expect:` block, because there is nothing to write down:

```yaml
- name: Filtering Rows
  obj: 'Show every column of the books whose `genre` is `Science Fiction`.'
  max: '4/1'
  sql: true
  start: |
    SELECT *
    FROM books
    -- Keep only the science fiction
  sol: |
    SELECT *
    FROM books
    WHERE genre = 'Science Fiction';
  checks:
    has:
      - '(?i)where'
    msg: 'Filter the rows with a `WHERE` clause rather than listing them another way.'
```

**The expected answer is the level's own `sol`, executed live.** On Submit the
student's SQL and the solution each run against their own fresh database, both
built from the same script, and the two results are compared. This is the same
rule the Python tracks follow — never predict output, capture it — taken one step
further: there is no captured value to go stale, so a wrong expectation cannot be
written in the first place.

The database lives on the **track**, in a `db:` script at the top of the YAML,
not on each level. One schema for all thirty levels means a student learns the
two tables once. A level that needs different data can add its own `seed:`, which
is appended to the track script for that level only.

Because the answer comes from execution, `INSERT` / `UPDATE` / `DELETE` /
`CREATE TABLE` levels grade too: those statements return no rows, so both
databases are dumped afterwards and compared table by table.

Three deliberate reliefs keep correct answers from failing, since SQL lets the
same question be asked several ways:

| Relief | Why |
|--------|-----|
| Row order is ignored **unless the solution contains `ORDER BY`** | without one, SQLite may return rows in whatever order its plan produces, and a join and a subquery legitimately disagree. When the level *is* about `ORDER BY`, the order becomes the answer and is checked. |
| Column names are ignored unless the level sets `matchCols: true` | `COUNT(*)` and `COUNT(*) AS total` answer the same question. Exactly one level in the track opts in — the one teaching `AS`. |
| `4` and `4.0` compare equal; longer fractions round to 6 decimals | `AVG()` and `SUM()/COUNT()` disagree in type and in the last binary place, and a student who did it the long way is not wrong. |

Those reliefs open a hole — a student could type the rows out by hand as a
`SELECT` of literals — so most levels also carry a regex `checks:` block. **Start
every SQL pattern with `(?i)`**: SQL is case-insensitive, and a check accepting
only `GROUP BY` would reject the identical query in lower case. As on JavaScript
levels, only the regex forms are allowed; the AST forms need Python.

`tests/sqlLevels.test.js` runs the same SQLite build off disk that the browser
fetches over HTTP, so CI and the student cannot diverge — the one thing that made
the web track expensive. It checks every solution passes, every starter fails,
every `max:` is reachable, and every pattern is case-insensitive, and it carries
two named groups worth keeping in mind when adding levels: answers a student
might plausibly write instead (lower case, aliases, a missing semicolon) which
must pass, and answers that reach the right rows the wrong way, which must fail
with the level's own `msg`.

Queries run in their own Web Worker, for the reason Pyodide does: `MAX_ROWS`
caps the reader at 500 rows, but only `terminate()` can stop a runaway
`WITH RECURSIVE` already wedged inside a single SQLite step.

### Backend levels

The two backend tracks are ordinary Python graded by ordinary stdout comparison.
There is no server anywhere — the site is a static SPA and could not host one —
and none is needed, because **a web application is just a callable**: hand it a
request, it hands back a response. That is the whole idea the tracks teach, and
it is also why they work in a browser tab.

Two YAML fields carry it. A chapter declares `lib:`, and every level in it gets
the framework seeded beside `main.py`:

```yaml
chapters:
  - name: Your First App
    icon: mechanism
    lib: miniweb          # chapters 1-3 omit this
```

`withLib()` in `src/data/levelSource.js` merges it into `level.files.initial` at
parse time. Nothing in any runner changed: the browser worker, the dev server and
the CPython test harness all already write `files.initial` into the interpreter's
working directory, which is on `sys.path`. A side effect worth keeping — the file
panel renders seeded files as read-only tabs, so all 16 KB of `miniweb.py` sits
open beside the student's code from chapter 4 onward. That is the payoff for
having made them build a router in chapter 3. **Keep it read-only:** a student who
can edit the framework can edit the answer into it.

A level then declares `req:`, the requests the grader issues *after* the
student's code has run:

```yaml
req:
  - 'GET /notes'
  - 'GET /search?q=cats'
  - { m: POST, p: /notes, json: { text: 'buy milk' } }
  - { m: GET, p: /me, hdr: { Authorization: 'Bearer abc123' } }
see:                      # header names to print, when a level is about headers
  - Location
app: site                 # the app object's name, when it is not `app`
```

`requestDriver()` turns that into Python appended to the composed source, which
prints one block per request:

```
GET /notes -> 200 OK
[{"id": 1, "text": "buy milk"}]
GET /notes/9 -> 404 Not Found
{"error": "Not Found"}
```

Grading is then exactly `checkOutput(stdout, test)` as everywhere else — no
second comparison path to drift. The driver is **appended, never prepended**, so
a student's traceback line numbers still match what they typed.

Route handlers print nothing, so *something* has to make the requests. It is
deliberately not the student's own code: a level whose solution printed its own
results could be passed by printing the expected text and never writing a route.
Because the driver's output is appended unavoidably, a faked answer produces the
fake lines *and* the driver's real 404s, and fails.

One documented relief: a JSON body is re-parsed and re-dumped with sorted keys,
so a student who builds `{"text": t, "id": i}` is not failed against a solution
that happened to build it the other way round. Exactly parallel to the SQL
track's row-order relief.

#### The `browser` tab

Beside `main.py` and `miniweb.py` sits a third tab that is not a file at all. It
renders the responses the way the client that asked for them would: an address
bar, a status, and the body drawn as a page rather than as console text. One pill
per request when a level makes more than one.

It costs grading nothing, because it is fed by a **separate composition**. Run
calls `withDriver(level, src, { probe: true })`, which appends the same driver
plus a marker line and a JSON dump of every response; Submit calls
`withDriver(level, src)` and gets exactly the program CI certified. `splitProbe()`
cuts the stdout at the marker — everything before it goes to the console byte for
byte, everything after it becomes the tab. `tests/backendLevels.test.js` asserts
that equality per level, so the console can never drift from what grading sees.

The body is drawn four ways, chosen by the response itself: a `3xx` shows where
it would have sent the browser (the test client does not follow it, which is the
point of the redirect level), an empty body says so, `application/json` is
pretty-printed, and anything else is rendered in an iframe with `sandbox` set to
nothing at all. Only headers named in `see:` are shown, so the tab and the
expected output cannot disagree about which ones matter.

The address bar is editable. Type a path, press Enter, and the level runs again
with `req:` replaced by that single `GET` — the response is appended as a new
pill and selected, and **only the probe payload is kept**, so the console still
belongs to the last Run and exploring can never disturb the graded transcript.
GET only: typing a URL into a browser is a GET, and anything that needs a body
stays in `req:`, where it can carry one. Each navigation is its own process, so
in-memory state an earlier request mutated is back — said in the field's tooltip
rather than worked around, since a long-lived per-tab process is not what grading
runs. A tab also carries a small accent dot when a run lands while the student is
looking at `main.py`; opening the tab clears it.

Two rules when adding levels here:

1. **`miniweb.py` must never write to `sys.stderr`.** The CPython suite compares
   stdout only, while the Pyodide worker merges stderr into stdout. A framework
   that printed a traceback would pass CI and fail every student. A handler that
   raises becomes a 500 plus one `!!` line on **stdout**, and
   `tests/miniweb.test.js` asserts stderr stays empty.
2. **Never print `sqlite3.sqlite_version` or `sys.version`.** They differ between
   Pyodide and the CPython that captures expected output (3.39.0 vs 3.50.4, and
   3.13.2 vs 3.13.14), so a level that printed either would pass CI and fail in
   the browser.

Expected output is captured, never typed. `scripts/capture-backend.mjs` is the
authoring tool: write a level with `exp: __CAPTURE__`, run it with `--fix`, and
the real run's output is written into the YAML as a block scalar.

`tests/backendLevels.test.js` runs every backend level through real CPython with
the lib seeded and the driver appended, and checks that the solution produces its
declared output with **empty stderr**, that the starter does not already pass
(counting `checks:`, since a level like "Comparing Secrets Safely" is legitimately
gated on using `compare_digest` rather than on its output), that the line budget
is reachable, that each `checks.has`/`checks.no` matches its own solution, that
`req:` entries are well formed and number eight or fewer (the worker's 8-second
timeout), and that a level's `app:` name is really assigned in its solution.

There is no node-based Pyodide parity test. The npm `pyodide` package ships
`python_stdlib.zip` but not the unvendored wheels, and `sqlite3` and `hashlib`
cannot be loaded from the CDN under bare node — so the check belongs in the
browser, where it is authoritative anyway. To re-run it after a Pyodide upgrade,
open any level on `npm run dev` and paste into the console:

```js
const t = await import('/src/data/tracks.js');
const ls = await import('/src/data/levelSource.js');
const om = await import('/src/utils/outputMatcher.js');
const p = await import('/src/utils/pyodideWorkerClient.js');
const bad = [];
for (const slug of ['backend', 'apis'])
  for (const ch of t.TRACKS.find((x) => x.slug === slug).chapters)
    for (const lv of ch.levels) {
      const out = await p.runInPyodideWorker(ls.runnableSource(slug, lv), {
        initialFiles: lv.files?.initial || {},
      });
      if (!(lv.tests || []).every((tt) => om.checkOutput(out.stdout, tt))) bad.push(lv.name);
    }
bad;
```

All 78 currently return byte-identical output to CPython, the slowest taking
168 ms (`pbkdf2_hmac` at 100 000 iterations).

Backend levels are excluded from the CPython corpus in `tests/levelSource.test.js`
and from all three Arcade pools — a snippet of route handlers that print nothing,
whose answer comes from a driver the player never sees, would not be the program
on screen. The guard is on `ch.lib` as well as `lvl.req`, because a level can
import the framework and still print for itself.

### Full-stack levels

The Web Developer track is a backend level whose verdict comes from a DOM. It
adds exactly one YAML field:

```yaml
req:
  - 'GET /'
  - 'GET /api/notes'
render: 'GET /'          # which response is the page
expect:                  # the same assertions the HTML track uses
  - sel: '#notes li'
    count: 2
```

`render:` names one of the requests in `req:`; a bare path means `GET`. The rest
of the machinery is already there: `withDriver(level, src, { probe: true })`
composes the same program the backend tracks run, the probe payload already
carries every response's exact status, headers and bytes, and `runWebLevel`
already grades a page. `src/backend/fullstack.js` is the join, and it is 60 lines
because it invents nothing.

The interesting half is `src/backend/fetchShim.js`. From chapter 3 on, the page
the student served calls the API the same student served — and those two live in
a Web Worker and an opaque-origin iframe with no network between them. So the
requests are answered *before* they are asked: every response in `req:` becomes
an entry in a table, and a shim installed ahead of the page's own script serves
`window.fetch` out of it. Same status, same headers, same bytes, produced by the
student's own handlers, and never synchronous — one turn of the event loop, so a
page written as if `fetch` returned data would fail here as it would anywhere.
`window.__fetchIdle()` is how the runner knows to wait: grading a fetch-driven
page on the `load` event alone would check an empty list every time.

What it deliberately is not is live. A `POST` from the page cannot change what a
later `GET` returns, because every response was computed up front. Levels that
touch it say so in their own text rather than pretending otherwise — the same
bargain the `browser` tab's address bar makes.

Two rules that are easy to break and expensive to notice:

- **Any JSON embedded in a `<script>` must have every `<` escaped.** The HTML
  parser ends a script at the first `</script`, including one inside a string
  literal — and from chapter 3 the table's bodies *are* pages with scripts in
  them. `embed()` in `fetchShim.js` does it; `webRuntime.js` does the same to its
  expectations.
- **No backtick may appear inside either injected script**, not even in a
  comment. Both are template literals, one backtick ends them, and the halves
  either side stay valid JavaScript — the runner silently becomes a boolean and
  every level times out with "your page took too long to load". Nothing else
  catches it: jsdom does not run an iframe's `srcdoc`, so `runWebLevel` itself is
  unreachable in CI. `tests/webRuntime.test.js` guards the two templates.

Grading applies both halves. `tests/fullstackLevels.test.js` runs each solution
through Pyodide under node (`tests/pyodideRunner.js`, which sidesteps the CPython
harness — the npm package has no `sqlite3`, so full-stack levels do not use one),
renders the page in JSDOM with the shim installed, and checks the `expect:` rules
*and* any `tests:` against the transcript. It also asserts the starter does not
already pass, which is what catches a level whose subject is invisible to the DOM
— a redirect, or a body that happens to look the same either way.

Note that `tracks.js` treats a missing icon as a hard error, so a new track or
chapter needs its SVG in `src/assets/icons/` before its YAML lands — otherwise
the app fails at module load rather than degrading. `tests/icons.test.js`
enforces both directions: no missing icon, and no unused file.

Editing an *existing* level has one more consequence: the Arcade's Bug Hunt deck
is generated offline from level sources, so a changed level leaves its puzzle
pointing at the wrong line. `tests/bugHunt.test.js` catches that by hashing the
source; run `node scripts/generate-bughunt.mjs` to rebuild the deck.

## Testing

```bash
npm test
```

The suite runs every track's solutions through real CPython and asserts their
output matches the declared tests, alongside unit tests for the output matcher,
validators, and each visualization's trace converter.

Levels that hand the student a file are graded on the resulting **file contents**
rather than printed output, so they need their own coverage — `tests/fileLevels.test.js`
runs those solutions and inspects the files they leave behind. It also asserts
that a file-graded level actually changes a tracked file, since otherwise an
empty submission would pass too.

One caveat worth knowing: the suite compares **stdout only**, while the app shows
stdout and stderr together. A solution that writes to stderr — `unittest.TextTestRunner`
does, and `verbosity=0` does not silence it — will pass here and fail in the
browser. Pass such runners a `stream=io.StringIO()`.

## Deployment

Configured for [Vercel](https://vercel.com). `vercel.json` rewrites all routes to
`index.html` so React Router works in production. There is no server-side
runtime — the deployment is fully static and Python runs in the visitor's
browser.

To deploy your own instance:

1. Fork this repository
2. Import the project into Vercel
3. (Optional) add the two `VITE_SUPABASE_*` environment variables
4. Deploy

## Contributing

Contributions are welcome — open an issue or submit a pull request.

1. Fork the project
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request
