import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load as loadYaml } from "js-yaml";
import { TRACK_ORDER, trackRank, orderTracks } from "../src/data/levelSource.js";

// Display order is a list of slugs rather than the file names the Vite glob
// returns (see TRACK_ORDER). Nothing at runtime fails when a track is missing
// from that list — it just quietly sorts to the end — so this is the check that
// makes adding a track without placing it a build failure instead of a surprise
// at the bottom of the tracks page.

const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");

const onDisk = readdirSync(TRACKS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => ({ file: f, ...loadYaml(readFileSync(join(TRACKS_DIR, f), "utf-8")) }));

describe("track order", () => {
  it("places every track on disk, and places nothing that isn't there", () => {
    const slugs = onDisk.map((t) => t.slug).sort();
    expect([...TRACK_ORDER].sort()).toEqual(slugs);
  });

  it("lists each slug once", () => {
    expect(new Set(TRACK_ORDER).size).toBe(TRACK_ORDER.length);
  });

  it("never puts a harder track before an easier one", () => {
    // The chosen order is easiest-first, so difficulty must be non-decreasing.
    // This is the rule that would silently rot as tracks are added.
    const byRank = orderTracks(onDisk);
    const difficulties = byRank.map((t) => t.difficulty);
    const sorted = [...difficulties].sort((a, b) => a - b);
    expect(difficulties, byRank.map((t) => `${t.slug}(${t.difficulty})`).join(" ")).toEqual(sorted);
  });

  it("starts the site on Python Fundamentals", () => {
    expect(orderTracks(onDisk)[0].slug).toBe("python");
  });

  it("sorts an unplaced slug to the end without throwing", () => {
    expect(trackRank("does-not-exist")).toBe(TRACK_ORDER.length);
    const out = orderTracks([{ slug: "does-not-exist" }, { slug: "python" }]);
    expect(out.map((t) => t.slug)).toEqual(["python", "does-not-exist"]);
  });
});
