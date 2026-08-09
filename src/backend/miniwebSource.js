// The backend tracks hand the student a small framework to import. It is a real
// .py file rather than a string in here, so it is highlighted, diffable and
// directly runnable by CPython — `?raw` just carries its bytes into the bundle.
//
// Chapters opt in with `lib: miniweb` in their YAML; src/data/tracks.js merges
// the entry below into every level's `files.initial`, which the Pyodide worker,
// the dev server and the CPython test harness all already know how to seed.
//
// Deliberately NOT imported by src/data/levelSource.js: node scripts import that
// module directly, where Vite's `?raw` suffix does not resolve. This file holds
// the bytes; levelSource.js holds the rule.
import miniwebPy from "./miniweb.py?raw";

export const BACKEND_LIBS = {
  miniweb: { "miniweb.py": miniwebPy },
};
