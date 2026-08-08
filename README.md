# Step Into Code

An open, beginner-friendly platform for learning Python in the browser. It is
completely free, and you can start immediately — no sign-up, no install, no
local Python.

You write code in a real editor, run it against test cases, and earn stars for
getting it right, keeping it short, and keeping it fast. Many levels come with a
visualization that animates **your own code as it actually runs**, and the Game
Development track lets you build playable games on a canvas.

## Tracks

**487 levels across 7 tracks and 71 chapters.**

| Track | Difficulty | Chapters | Levels |
|-------|-----------|----------|--------|
| Python Fundamentals | Beginner | 12 | 100 |
| Python Beyond | Intermediate | 8 | 78 |
| Object-Oriented Programming | Intermediate | 8 | 72 |
| Data Structures | Intermediate | 9 | 55 |
| Algorithm Design & Patterns | Advanced | 11 | 60 |
| Game Development | Advanced | 7 | 46 |
| Machine Learning | Advanced | 16 | 76 |

Machine Learning implements every algorithm by hand in pure Python — no numpy,
no scikit-learn — from gradient descent up to a neural network that learns XOR
and a Q-learning agent.

## Features

- **No sign-up required.** An optional account syncs progress across devices;
  without one, everything is stored locally and works exactly the same.
- **Runs entirely in your browser.** Python executes via Pyodide (WebAssembly) in
  a Web Worker, so there is no server to wait on and an infinite loop can't
  freeze the page.
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

## Project Structure

```
Step-Into-Code/
├── public/                  # Static assets
├── src/
│   ├── assets/              # SVG icons, sounds
│   ├── components/          # Shared UI
│   ├── context/             # Auth, Progress, Theme providers
│   ├── data/
│   │   ├── tracks.js        # YAML loading + normalization
│   │   └── tracks/          # python1-7.yaml — all level content
│   ├── editor/              # CodeMirror setup
│   ├── game/                # pygame shim + game modal
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
