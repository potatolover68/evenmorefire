import { describe, expect, it } from "vitest";
import { cleanTaintedHistory, type Revision } from "../scrubber/index";

describe("bench", () => {
  it("cleans a synthetic 5k-revision page in under 10 seconds", () => {
    const sentence =
      "The committee reviewed the harbour ledger and filed the note.";
    const paragraphs = Array.from(
      { length: 2400 },
      (_, index) => `${sentence} Entry ${index} stands.`,
    );
    const revisions: Revision[] = [];
    const current = paragraphs.slice();
    revisions.push({ revid: 1, content: current.join("\n\n") });
    for (let i = 2; i <= 5000; i++) {
      const index = (i * 17) % current.length;
      current[index] =
        `Revision ${i} reviewed the harbour ledger and filed the note.`;
      revisions.push({ revid: i, content: current.join("\n\n") });
    }
    const bytes = revisions[revisions.length - 1]!.content!.length;
    expect(bytes).toBeGreaterThan(140_000);

    const started = performance.now();
    const result = cleanTaintedHistory(revisions, [2500]);
    const elapsed = performance.now() - started;
    console.log(
      `bench ${revisions.length} revisions, ${bytes} bytes, ${elapsed.toFixed(0)} ms`,
    );
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content).not.toContain("Revision 2500 ");
    expect(elapsed).toBeLessThan(10_000);
  });
});
