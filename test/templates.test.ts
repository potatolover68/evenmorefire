import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index";

const before = "{{Infobox settlement|name=Old}}\n\nAlpha.";
const after = "{{Infobox settlement|name=New}}\n\nAlpha. Tainted.";

function history() {
  return [
    { revid: 1, content: before },
    { revid: 2, content: after },
  ];
}

describe("untainted templates", () => {
  it("keeps the latest infobox once and drops the new sentence", () => {
    const result = cleanTaintedHistory(history(), [2], {
      untaintedTemplates: true,
    });
    const nameNew = result.content.split("name=New").length - 1;
    expect(nameNew).toBe(1);
    expect(result.content).not.toContain("name=Old");
    expect(result.content).not.toContain("Tainted");
    expect(result.content).toContain("Alpha.");
  });

  it("does not keep a tainted infobox when templates can be tainted", () => {
    const result = cleanTaintedHistory(history(), [2], {
      untaintedTemplates: false,
    });
    expect(result.content).not.toContain("name=New");
    expect(result.content).toContain("name=Old");
  });
});
