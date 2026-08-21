import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { THEMES, DEFAULT_DARK, DEFAULT_LIGHT, isDarkTheme, themeById } from "../src/lib/themes.js";

// The theme system lives in three places that must agree: the registry
// (themes.js), the palettes (index.css) and the no-flash script (index.html).
// Nothing at runtime checks they match, so these tests are the only thing
// standing between a new theme and a page that half-changes colour.

const css = readFileSync("src/index.css", "utf8");
const html = readFileSync("index.html", "utf8");

/** The variable names a css block defines, given the text after its selector. */
function varsIn(block) {
  return [...block.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]).sort();
}

/** The body of the first `selector { ... }` block. */
function blockFor(selector) {
  const at = css.indexOf(selector);
  if (at < 0) return null;
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the theme registry", () => {
  it("offers at least five themes with unique ids", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("keeps both toggle defaults present, on the right sides", () => {
    expect(isDarkTheme(DEFAULT_DARK)).toBe(true);
    expect(isDarkTheme(DEFAULT_LIGHT)).toBe(false);
  });

  it("gives every theme a three-colour swatch for the picker", () => {
    for (const t of THEMES) {
      expect(t.swatch).toHaveLength(3);
      for (const c of t.swatch) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("answers sensibly about unknown ids", () => {
    expect(themeById("neon-toothpaste")).toBeNull();
    expect(isDarkTheme("neon-toothpaste")).toBe(false);
  });
});

describe("the palettes in index.css", () => {
  // .dark is the canonical set of palette variables; every named theme must
  // define exactly the same names, or some part of the page keeps the previous
  // theme's colour.
  const canonical = varsIn(blockFor(".dark"));

  it("has a complete block for every theme beyond the two defaults", () => {
    for (const t of THEMES) {
      if (t.id === "light" || t.id === "dark") continue;
      const block = blockFor(`:root[data-theme="${t.id}"]`);
      expect(block, `missing css block for theme "${t.id}"`).not.toBeNull();
      expect(varsIn(block), `variables for theme "${t.id}"`).toEqual(canonical);
    }
  });

  it("keeps the canonical set non-trivial", () => {
    expect(canonical.length).toBeGreaterThanOrEqual(10);
  });
});

describe("the no-flash script in index.html", () => {
  it("carries exactly the dark theme ids from the registry", () => {
    const m = html.match(/var darkIds = \[([^\]]*)\]/);
    expect(m, "index.html no longer declares darkIds").not.toBeNull();
    const scripted = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    const real = THEMES.filter((t) => t.dark).map((t) => t.id).sort();
    expect(scripted).toEqual(real);
  });
});
