import { describe, it, expect, beforeEach } from "vitest";
import { adoptLegacyKey } from "../src/lib/legacyStorage.js";

// The rename to Kodetika renamed every localStorage key the app owns. For a
// signed-out student there is no cloud copy, so getting this wrong does not
// degrade the site — it empties it: every star, every saved draft, every arcade
// score, gone with no way back. Hence a test for thirty lines of code.
//
// Storage is stubbed the same way tests/arcadeScores.test.js stubs it: these
// suites run in node, not jsdom, so there is no localStorage unless one is put
// on globalThis.

const OLD = "step-into-code_progress";
const NEW = "kodetika_progress";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("adoptLegacyKey", () => {
  it("carries the old key's value over when the new one is absent", () => {
    localStorage.setItem(OLD, '{"python":{"1":3}}');
    adoptLegacyKey(NEW, OLD);
    expect(localStorage.getItem(NEW)).toBe('{"python":{"1":3}}');
  });

  it("leaves the old key in place, so an older deployment still finds it", () => {
    localStorage.setItem(OLD, '{"python":{"1":3}}');
    adoptLegacyKey(NEW, OLD);
    expect(localStorage.getItem(OLD)).toBe('{"python":{"1":3}}');
  });

  // The one that matters on the second visit: by then the app has written real
  // data under the new key, and the stale pre-rename copy must not win.
  it("never overwrites data already written under the new key", () => {
    localStorage.setItem(OLD, '{"python":{"1":1}}');
    localStorage.setItem(NEW, '{"python":{"1":3}}');
    adoptLegacyKey(NEW, OLD);
    expect(localStorage.getItem(NEW)).toBe('{"python":{"1":3}}');
  });

  it("is safe to run twice", () => {
    localStorage.setItem(OLD, "first");
    adoptLegacyKey(NEW, OLD);
    localStorage.setItem(NEW, "second");
    adoptLegacyKey(NEW, OLD);
    expect(localStorage.getItem(NEW)).toBe("second");
  });

  it("does nothing for a student who never used the old version", () => {
    adoptLegacyKey(NEW, OLD);
    expect(localStorage.getItem(NEW)).toBe(null);
  });

  // Private mode and the web track's opaque-origin iframe both throw on access.
  // A migration is not worth taking the app down for.
  it("swallows a storage that throws", () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error("access denied");
      },
      setItem() {
        throw new Error("access denied");
      },
    };
    expect(() => adoptLegacyKey(NEW, OLD)).not.toThrow();
  });
});
