import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index.ts";
import { inclusiveLines } from "../userscript/gutter.ts";

describe("latest revision spans", () => {
  it("covers the removed lines instead of a single point in the cleaned text", () => {
    const latest = [
      "Keep.",
      "[[Category:Actors]]",
      "[[Category:Alumni]]",
      "",
    ].join("\n");
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Keep.\n" },
        { revid: 2, content: latest },
      ],
      [2],
    );
    const removal = result.explanations.find(
      (item) => item.action === "remove-tainted",
    );
    expect(removal?.latestStart).toBeTruthy();
    expect(removal?.latestEnd).toBeTruthy();
    const lines = inclusiveLines(removal!.latestStart!, removal!.latestEnd!);
    const covered = latest
      .split("\n")
      .slice(lines.start, lines.end + 1)
      .join("\n");
    expect(covered).toContain("Category:Actors");
    expect(covered).toContain("Category:Alumni");
    expect(covered).not.toContain("Keep.");
    expect(result.content).not.toContain("Category:Actors");
  });
});
