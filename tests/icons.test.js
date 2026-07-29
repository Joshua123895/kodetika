import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { load as loadYaml } from "js-yaml";

// Icons resolve by FILENAME (see resolveIcon in src/data/tracks.js): `icon: foo`
// in a YAML needs assets/icons/<scope>/foo.svg to exist. Nothing registers them
// by hand any more, so nothing would catch a typo or a missing file at build
// time -- the app just renders a letter badge. These tests are that safety net.

const ICON_ROOT = join(process.cwd(), "src/assets/icons");
const TRACK_DIR = join(ICON_ROOT, "track");
const CHAPTER_DIR = join(ICON_ROOT, "chapter");

const svgNames = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""));

const trackFiles = new Set(svgNames(TRACK_DIR));
const chapterFiles = new Set(svgNames(CHAPTER_DIR));

const tracks = readdirSync(join(process.cwd(), "src/data/tracks"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => loadYaml(readFileSync(join(process.cwd(), "src/data/tracks", f), "utf8")));

describe("icon files", () => {
  it("splits icons into track/ and chapter/ with nothing loose at the root", () => {
    const loose = readdirSync(ICON_ROOT).filter((f) => f.endsWith(".svg"));
    expect(loose).toEqual([]);
    expect(trackFiles.size).toBeGreaterThan(0);
    expect(chapterFiles.size).toBeGreaterThan(0);
  });

  for (const track of tracks) {
    it(`track "${track.name}" resolves icon "${track.icon}" to track/${track.icon}.svg`, () => {
      expect(trackFiles.has(track.icon)).toBe(true);
    });
  }

  it("every chapter icon has a file in chapter/", () => {
    const missing = [];
    for (const track of tracks) {
      for (const ch of track.chapters) {
        if (!chapterFiles.has(ch.icon)) missing.push(`${track.name} / ${ch.name} -> ${ch.icon}.svg`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no unused icon files", () => {
    const usedTrack = new Set(tracks.map((t) => t.icon));
    const usedChapter = new Set(tracks.flatMap((t) => t.chapters.map((c) => c.icon)));
    expect([...trackFiles].filter((f) => !usedTrack.has(f))).toEqual([]);
    expect([...chapterFiles].filter((f) => !usedChapter.has(f))).toEqual([]);
  });

  it("ships real SVG markup, not empty or placeholder files", () => {
    for (const [dir, names] of [
      [TRACK_DIR, trackFiles],
      [CHAPTER_DIR, chapterFiles],
    ]) {
      for (const name of names) {
        const svg = readFileSync(join(dir, `${name}.svg`), "utf8");
        expect(svg, `${name}.svg`).toMatch(/<svg[\s>]/i);
      }
    }
  });
});
