import { describe, expect, it } from "vitest";
import { cleanTaintedHistory, type Revision } from "../scrubber/index";

const old = "which is also known for its cunningness";
const rewritten = "The fox, which is also known for its cunningness, jumped.";

function history(): Revision[] {
  return [
    { revid: 1, content: old },
    { revid: 2, content: rewritten },
    { revid: 3, content: `${rewritten} Done.` },
  ];
}

describe("orphaned fragments", () => {
  it("leaves a relative clause and flags it when the option is off", () => {
    const result = cleanTaintedHistory(history(), [2]);
    expect(result.content).toContain("which is also known");
    expect(result.explanations.some((note) => note.action === "flag-fragment")).toBe(
      true,
    );
  });

  it("deletes a relative clause whose main clause was removed", () => {
    const result = cleanTaintedHistory(history(), [2], { avoidOrphans: true });
    expect(result.content).not.toContain("which is also known");
    expect(
      result.explanations.some((note) => note.action === "remove-fragment"),
    ).toBe(true);
  });

  it("keeps a complete sentence beside a removed one", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Alpha stays. The fox jumped." },
        { revid: 2, content: "Alpha stays. A hare slept." },
      ],
      [2],
      { avoidOrphans: true },
    );
    expect(result.content).toContain("Alpha stays.");
  });
});
