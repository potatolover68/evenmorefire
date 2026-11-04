import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index";

describe("section headings", () => {
  it("puts a heading on its own line after prose before it is removed", () => {
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content: "Lead.<ref>ok</ref>\n\n== History ==\n\nOld.",
        },
        {
          revid: 2,
          content: "Lead.<ref>ok</ref> Tainted claim.\n\n== History ==\n\nOld.",
        },
      ],
      [2],
    );
    expect(result.content).not.toMatch(/<\/ref>==/);
    expect(result.content).toMatch(/<\/ref>\n+== History ==/);
    expect(result.content).toContain("== History ==");
  });

  it("does not rewrite a heading that is already on its own line", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Lead.\n\n== History ==\n\nOld." },
        { revid: 2, content: "Lead.\nTainted.\n\n== History ==\n\nOld." },
      ],
      [2],
    );
    expect(result.content).toContain("Lead.\n\n== History ==");
  });
});
