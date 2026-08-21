// The theme registry. Each entry names a full palette living in index.css:
// `light` is the bare :root, `dark` is the .dark class, and every other id has
// a `:root[data-theme="..."]` block. The `dark` flag is what the rest of the
// app keys off — the editor chrome, the web preview and ::selection all follow
// it — so a new theme only has to decide which side of that line it lives on.
//
// `swatch` is the three colours the picker paints its little preview with:
// page background, card, and text. They repeat values from index.css on
// purpose; a swatch that read the live CSS variables would show every theme in
// the current theme's colours.
//
// The no-flash script in index.html carries its own copy of the dark ids, and
// tests/themes.test.js fails the build if the two drift apart.

export const THEMES = [
  { id: "light", name: "Paper", dark: false, swatch: ["#EDE7D8", "#FAF6EC", "#2F2F2F"] },
  { id: "dark", name: "Space", dark: true, swatch: ["#1a1b2e", "#2d2d44", "#CDD6F4"] },
  { id: "midnight", name: "Midnight", dark: true, swatch: ["#0B1020", "#151B2E", "#D6E2F5"] },
  { id: "forest", name: "Forest", dark: true, swatch: ["#0E1712", "#18261D", "#D8E8DC"] },
  { id: "sakura", name: "Sakura", dark: false, swatch: ["#F3DEE4", "#FBF1F4", "#43303A"] },
  { id: "synthwave", name: "Synthwave", dark: true, swatch: ["#17102B", "#241A41", "#E8DFFF"] },
];

export const DEFAULT_LIGHT = "light";
export const DEFAULT_DARK = "dark";

export function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? null;
}

export function isDarkTheme(id) {
  return Boolean(themeById(id)?.dark);
}
