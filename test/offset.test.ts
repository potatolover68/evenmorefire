import { describe, expect, it } from "vitest";
import { offsetAfterLatest } from "../userscript/contribs.ts";

describe("contributions offset", () => {
  it("is one hour after the newest checked edit", () => {
    expect(
      offsetAfterLatest(["2026-08-17T21:48:50Z", "2026-08-01T00:00:00Z"]),
    ).toBe("20260817224850");
  });

  it("ignores timestamps that are not dates", () => {
    expect(offsetAfterLatest(["not a date"])).toBeNull();
    expect(offsetAfterLatest([])).toBeNull();
  });
});
