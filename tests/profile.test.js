import { describe, it, expect } from "vitest";
import { displayNameOf, avatarOf, initialOf, cleanDisplayName, DISPLAY_NAME_MAX } from "../src/lib/profile.js";

const user = (email, meta = {}) => ({ email, user_metadata: meta });

describe("displayNameOf", () => {
  it("prefers the name the person set themselves", () => {
    expect(displayNameOf(user("jojo@x.com", { display_name: "Joshua", full_name: "J Irwanto" }))).toBe("Joshua");
  });

  it("falls back to what Google supplied, then the email handle", () => {
    expect(displayNameOf(user("jojo@x.com", { full_name: "J Irwanto" }))).toBe("J Irwanto");
    expect(displayNameOf(user("jojo05.irwanto@gmail.com"))).toBe("jojo05.irwanto");
  });

  it("does not let a blank display_name hide a real fallback", () => {
    expect(displayNameOf(user("jojo@x.com", { display_name: "   ", full_name: "J" }))).toBe("J");
  });

  it("survives no user at all", () => {
    expect(displayNameOf(null)).toBe("");
  });
});

describe("avatarOf", () => {
  it("reads avatar_url, then Google's picture, else null", () => {
    expect(avatarOf(user("a@b", { avatar_url: "https://x/a.png" }))).toBe("https://x/a.png");
    expect(avatarOf(user("a@b", { picture: "https://x/p.png" }))).toBe("https://x/p.png");
    expect(avatarOf(user("a@b"))).toBeNull();
  });
});

describe("initialOf and cleanDisplayName", () => {
  it("takes one capital, with a question mark for nothing", () => {
    expect(initialOf("joshua")).toBe("J");
    expect(initialOf("  ")).toBe("?");
  });

  it("tidies whitespace and caps the length", () => {
    expect(cleanDisplayName("  Joshua   Irwanto  ")).toBe("Joshua Irwanto");
    expect(cleanDisplayName("x".repeat(100))).toHaveLength(DISPLAY_NAME_MAX);
  });
});
