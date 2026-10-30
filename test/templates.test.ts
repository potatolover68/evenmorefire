import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index";

const before = "{{Infobox settlement|name=Old}}\n\nAlpha.";
const after = "{{Infobox settlement|name=New}}\n\nAlpha. Tainted.";
const later = "{{Infobox settlement|name=New}}\n\nAlpha. Tainted. Later.";

function trailing() {
  return [
    { revid: 1, content: before },
    { revid: 2, content: after },
  ];
}

function followedByClean() {
  return [
    { revid: 1, content: before },
    { revid: 2, content: after },
    { revid: 3, content: later },
  ];
}

describe("untainted templates", () => {
  it("reverts a trailing template rewrite to the parent text", () => {
    const result = cleanTaintedHistory(trailing(), [2], {
      untaintedTemplates: true,
    });
    expect(result.content).toBe(before);
  });

  it("keeps a trailing template when skip non-prose blocks the revert", () => {
    const result = cleanTaintedHistory(trailing(), [2], {
      untaintedTemplates: true,
      skipNonProse: true,
    });
    const nameNew = result.content.split("name=New").length - 1;
    expect(nameNew).toBe(1);
    expect(result.content).not.toContain("name=Old");
    expect(result.content).not.toContain("Tainted");
    expect(result.content).toContain("Alpha.");
  });

  it("keeps the latest infobox once when an older tainted edit still needs a scrub", () => {
    const result = cleanTaintedHistory(followedByClean(), [2], {
      untaintedTemplates: true,
    });
    const nameNew = result.content.split("name=New").length - 1;
    expect(nameNew).toBe(1);
    expect(result.content).not.toContain("name=Old");
    expect(result.content).not.toContain("Tainted");
    expect(result.content).toContain("Alpha.");
    expect(result.content).toContain("Later.");
  });

  it("does not keep a tainted infobox when templates can be tainted", () => {
    const result = cleanTaintedHistory(followedByClean(), [2], {
      untaintedTemplates: false,
    });
    expect(result.content).not.toContain("name=New");
    expect(result.content).toContain("name=Old");
    expect(result.content).toContain("Later.");
  });
});
