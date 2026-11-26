import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index";

describe("scrub cleanup", () => {
  it("puts a space back between a link and the next word", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "See [[American Idol]] spin-off tonight." },
        {
          revid: 2,
          content: "See [[American Idol]]spin-off tonight. Tainted claim.",
        },
        {
          revid: 3,
          content: "See [[American Idol]]spin-off tonight. Tainted claim. Kept.",
        },
      ],
      [2],
    );
    expect(result.content).toContain("]] spin-off");
    expect(result.content).not.toContain("]]spin-off");
    expect(result.content).not.toContain("Tainted");
  });

  it("removes a lowercase sentence left after the surrounding prose", () => {
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content: "a Christian group consisting of Sonya, Helena and Katerina.",
        },
        { revid: 2, content: "The hostages split into two groups." },
        { revid: 3, content: "The hostages split into two groups. Done." },
      ],
      [2],
      { avoidOrphans: true },
    );
    expect(result.content).not.toContain("Christian group");
    expect(result.content).toContain("Done.");
  });

  it("drops a citation paragraph whose sentence was removed", () => {
    const cite = "<ref>{{cite web|title=Box|url=http://example.com}}</ref>";
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content: `==Cast==\nAlice.\n\n${cite}\n\n==Reception==\nFine.`,
        },
        {
          revid: 2,
          content: `==Cast==\nAlice.\n\nThe film made money.${cite}\n\n==Reception==\nFine.`,
        },
        {
          revid: 3,
          content: `==Cast==\nAlice.\n\nThe film made money.${cite}\n\n==Reception==\nFine. Kept.`,
        },
      ],
      [2],
      { untaintedTemplates: true },
    );
    expect(result.content).toContain("Alice.");
    expect(result.content).toContain("Fine.");
    expect(result.content).not.toContain("cite web");
    expect(result.content).not.toContain("<ref>");
  });

  it("removes list lines that no longer have an item", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "==See also==\n* [[Alpha]]" },
        { revid: 2, content: "==See also==\n* [[Alpha]]\n* Tainted item" },
        {
          revid: 3,
          content: "==See also==\n* [[Alpha]]\n* Tainted item\n==References==\nOk.",
        },
      ],
      [2],
    );
    expect(result.content).toContain("[[Alpha]]");
    expect(result.content).not.toContain("Tainted");
    expect(result.content).not.toMatch(/^\*\s*$/m);
  });
});
