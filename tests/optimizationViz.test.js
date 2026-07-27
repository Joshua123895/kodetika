import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { buildGradientHarness, gradientTraceToStates } from "../src/visualizations/gradientTrace.js";

const START = "@@VIZTRACE@@";
const END = "@@ENDTRACE@@";

function traceWithPython(code) {
  const dir = mkdtempSync(join(tmpdir(), "optviz-"));
  try {
    writeFileSync(join(dir, "main.py"), buildGradientHarness(code));
    const out = execSync("python main.py", { cwd: dir, timeout: 30000, encoding: "utf8" });
    const i = out.indexOf(START);
    const j = out.indexOf(END);
    if (i < 0 || j < 0) throw new Error("no trace markers");
    return JSON.parse(out.slice(i + START.length, j));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const track = loadYaml(readFileSync(join(process.cwd(), "src/data/tracks/python7.yaml"), "utf8"));
const chapter = track.chapters.find((c) => c.name === "Optimization Methods");

// Guards the `viz: gradient_descent` tag on the Optimization Methods chapter: each
// level must still produce a real, descending, on-chart trace from executed Python.
describe("Optimization Methods levels animate on the gradient viz", () => {
  for (const level of chapter.levels) {
    it(`${level.name} produces a descending trace`, () => {
      const states = gradientTraceToStates(traceWithPython(level.sol));
      console.log(
        `${level.name}: ${states.length} states, w ${states[0].w.toFixed(3)} -> ${states.at(-1).w.toFixed(3)}, ` +
          `loss ${states[0].loss.toFixed(3)} -> ${states.at(-1).loss.toFixed(3)}, ` +
          `offCurve=${states.filter((s) => s.offCurve).length}, domain=[${states[0].lo.toFixed(2)}, ${states[0].hi.toFixed(2)}]`
      );
      // enough frames to be worth animating
      expect(states.length).toBeGreaterThanOrEqual(4);
      // it actually converges toward the true weight of 2
      expect(states.at(-1).loss).toBeLessThan(states[0].loss);
      expect(Math.abs(states.at(-1).w - 2)).toBeLessThan(0.5);
      // nothing rendered as "off the chart"
      expect(states.filter((s) => s.offCurve)).toHaveLength(0);
    });
  }
});
