import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index";

describe("reference integrity", () => {
  it("does not leave a naked cite when templates cannot be tainted", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Lead." },
        {
          revid: 2,
          content:
            "Lead. The quick brown fox jumped over the lazy dog.<ref>{{cite book|title=Fox}}</ref>",
        },
        {
          revid: 3,
          content:
            "Lead. The quick brown fox jumped over the lazy dog.<ref>{{cite book|title=Fox}}</ref> Clean.",
        },
      ],
      [2],
      { untaintedTemplates: true },
    );
    expect(result.content).toMatch(
      /<ref>\{\{cite book\|title=Fox\}\}<\/ref>/,
    );
    expect(result.content).not.toMatch(
      /\{\{cite book\|title=Fox\}\}(?!<\/ref>)/,
    );
    expect(result.content).not.toContain("lazy dog");
  });

  it("does not leave an empty ref when skip non-prose keeps a rewritten cite", () => {
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content:
            "The quick brown fox jumped over the lazy dog.<ref>{{cite book|title=Old}}</ref>",
        },
        {
          revid: 2,
          content:
            "The quick brown fox jumped over the lazy dog.<ref>{{cite book|title=New}}</ref>",
        },
      ],
      [2],
      { skipNonProse: true },
    );
    expect(result.content).not.toMatch(/<ref>\s*<\/ref>/);
    expect(result.content).toContain("{{cite book|title=New}}");
    expect(result.content).toMatch(
      /<ref>\{\{cite book\|title=New\}\}<\/ref>/,
    );
  });

  it("still drops a trailing tainted sentence and its ref on an exact revert", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Lead." },
        {
          revid: 2,
          content:
            "Lead. The quick brown fox jumped over the lazy dog.<ref>{{cite book|title=Fox}}</ref>",
        },
      ],
      [2],
    );
    expect(result.content).toBe("Lead.");
  });
});
