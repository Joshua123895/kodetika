// Reports — and repairs — the "≤ N lines" star budget of every level.
//
// A budget is IMPOSSIBLE when the solution the level ships is longer than the
// budget it sets, which makes the second star unreachable by anyone. Run:
//
//   node scripts/star-budgets.mjs           # report only
//   node scripts/star-budgets.mjs --fix     # rewrite the broken `max:` values
//   node scripts/star-budgets.mjs --json    # machine-readable dump
//
// --fix edits the YAML in place, changing ONLY the numerator of `max: N/T` on
// levels whose budget is unreachable. It never lowers a budget.
//
// The measurement itself lives in tests/starBudgets.audit.js, because scripts/
// is gitignored and tests/starBudgets.test.js has to run on a clean clone.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditLevels, slackFor, TRACK_DIR } from "../tests/starBudgets.audit.js";

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const rows = auditLevels();
const broken = rows.filter((r) => r.margin < 0);
const ok = rows.filter((r) => r.margin >= 0);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, broken }, null, 2));
  process.exit(0);
}

console.log(`levels with a line budget: ${rows.length}`);
console.log(`impossible to 3-star:      ${broken.length}`);

const byTrack = {};
for (const r of broken) byTrack[r.track] = (byTrack[r.track] || 0) + 1;
if (broken.length) {
  console.log("\nby track:");
  for (const [slug, n] of Object.entries(byTrack).sort((a, b) => b[1] - a[1])) {
    const total = rows.filter((r) => r.track === slug).length;
    console.log(`  ${slug.padEnd(18)} ${String(n).padStart(3)} of ${total}`);
  }
}

console.log("\nmargin (budget - solution lines) on the achievable levels:");
const margins = ok.map((r) => r.margin);
const hist = {};
for (const m of margins) hist[m] = (hist[m] || 0) + 1;
for (const m of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
  const pct = ((hist[m] / margins.length) * 100).toFixed(1);
  console.log(`  +${String(m).padEnd(3)} ${String(hist[m]).padStart(4)}  ${pct.padStart(5)}%`);
}
console.log(
  `  median +${median(margins)}   mean +${(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2)}`
);

if (broken.length) {
  console.log("\nworst 15:");
  for (const r of [...broken].sort((a, b) => a.margin - b.margin).slice(0, 15)) {
    console.log(
      `  ${r.margin.toString().padStart(4)}  ${r.track.padEnd(16)} ${r.name.slice(0, 34).padEnd(36)} budget ${r.budget}, needs ${r.needed}`
    );
  }
}

if (!process.argv.includes("--fix")) {
  if (broken.length) console.log("\n(run with --fix to rewrite the broken budgets)");
  process.exit(0);
}

// --- fix -------------------------------------------------------------------
const edits = {};
for (const r of broken) (edits[r.file] ||= []).push(r);

let changed = 0;
for (const [file, levelRows] of Object.entries(edits)) {
  const path = join(TRACK_DIR, file);
  let text = readFileSync(path, "utf8");
  for (const r of levelRows) {
    const time = String(r.max).split("/")[1] ?? "1";
    const next = `max: ${r.needed + slackFor(r.needed)}/${time}`;
    // Anchored on the level's own name so the replacement cannot land on a
    // different level that happens to share a `max:` value.
    const block = new RegExp(
      // Names are sometimes quoted in the YAML and sometimes bare.
      `(- name: ['"]?${escapeRe(r.name)}['"]?\\r?\\n(?:[ \\t]+.*\\r?\\n|\\r?\\n)*?[ \\t]+)max: ${escapeRe(r.max)}(?=\\r?\\n|$)`
    );
    if (!block.test(text)) {
      console.error(`  ! could not locate ${r.track} / ${r.name}`);
      continue;
    }
    text = text.replace(block, `$1${next}`);
    changed++;
  }
  writeFileSync(path, text);
}
console.log(`\nrewrote ${changed} budgets`);
