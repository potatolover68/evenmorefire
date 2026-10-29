import { describe, expect, it } from "vitest";
import { cleanTaintedHistory, type Revision } from "../scrubber/index";

const opts = { skipNonProse: true };

function scrub(revisions: Revision[], tainted: number[]): string {
  return cleanTaintedHistory(revisions, tainted, opts).content;
}

describe("skip non-prose edits", () => {
  it("leaves a table-only tainted edit in place", () => {
    const before = "Alpha.";
    const after = 'Alpha.\n\n{| class="wikitable"\n| Cell\n|}';
    expect(
      scrub(
        [
          { revid: 1, content: before },
          { revid: 2, content: after },
        ],
        [2],
      ),
    ).toContain('{| class="wikitable"');
    expect(
      scrub(
        [
          { revid: 1, content: before },
          { revid: 2, content: after },
        ],
        [2],
      ),
    ).toContain("Cell");
  });

  it("removes a sentence and keeps an infobox added in the same edit", () => {
    const before = "Alpha.";
    const after = "{{Infobox settlement|name=Foo}}\n\nAlpha. Tainted.";
    const content = scrub(
      [
        { revid: 1, content: before },
        { revid: 2, content: after },
      ],
      [2],
    );
    expect(content).toContain("{{Infobox settlement|name=Foo}}");
    expect(content).toContain("Alpha.");
    expect(content).not.toContain("Tainted");
  });

  it("keeps a category, short description, file, and reference", () => {
    const before = "Alpha is a town.";
    const after = [
      "{{Short description|A town}}",
      "Alpha is a city.<ref>source</ref>",
      "",
      "[[File:A.jpg|thumb|A caption]]",
      "",
      "[[Category:Cities]]",
    ].join("\n");
    const content = scrub(
      [
        { revid: 1, content: before },
        { revid: 2, content: after },
      ],
      [2],
    );
    expect(content).toContain("{{Short description|A town}}");
    expect(content).toContain("[[File:A.jpg|thumb|A caption]]");
    expect(content).toContain("[[Category:Cities]]");
    expect(content).toContain("<ref>source</ref>");
    expect(content).toContain("town");
    expect(content).not.toContain("city");
  });

  it("still removes a heading and a list item", () => {
    const content = scrub(
      [
        { revid: 1, content: "Alpha." },
        { revid: 2, content: "Alpha.\n\n== Gone ==\n\n* Listed." },
      ],
      [2],
    );
    expect(content).toContain("Alpha.");
    expect(content).not.toContain("Gone");
    expect(content).not.toContain("Listed");
  });

  it("does not leave a quote stranded in front of a kept reference", () => {
    const before = "Alpha.";
    const after =
      "Alpha. Researchers objected.'<ref>{{cite news\n|title=Fight\n|url=https://example.com\n}}</ref>";
    const content = scrub(
      [
        { revid: 1, content: before },
        { revid: 2, content: after },
      ],
      [2],
    );
    expect(content).toContain("<ref>{{cite news");
    expect(content).toContain("|url=https://example.com");
    expect(content).toContain("}}</ref>");
    expect(content).not.toContain("objected");
    expect(content).not.toMatch(/'<ref/);
  });
});
