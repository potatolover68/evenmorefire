import { describe, expect, it } from "vitest";
import { isAllowlisted, parseAllowlist } from "../userscript/allowlist.ts";

describe("allowlist", () => {
  it("reads a JSON array of usernames", () => {
    expect(parseAllowlist(["MSK", " Example "])).toEqual(["MSK", " Example "]);
    expect(parseAllowlist({ users: ["MSK"] })).toEqual(["MSK"]);
    expect(parseAllowlist({ note: "no" })).toEqual([]);
  });

  it("matches names ignoring case, spaces, and underscores", () => {
    expect(isAllowlisted("MSK", ["MSK"])).toBe(true);
    expect(isAllowlisted("msk", ["MSK"])).toBe(true);
    expect(isAllowlisted("Jimbo_Wales", ["Jimbo Wales"])).toBe(true);
    expect(isAllowlisted("Someone else", ["MSK"])).toBe(false);
    expect(isAllowlisted("", ["MSK"])).toBe(false);
    expect(isAllowlisted("Anyone", ["*"])).toBe(true);
    expect(isAllowlisted("Anyone", ["*", "MSK"])).toBe(true);
    expect(isAllowlisted("Anyone", ["MSK", "*"])).toBe(false);
  });
});
