import { describe, expect, it } from "vitest";
import { cleanTaintedHistory } from "../scrubber/index.ts";
import { stripNakedTables } from "../scrubber/tables.ts";
import {
  matchContrib,
  defaultFilters,
  type Contrib,
} from "../userscript/filters.ts";
import { articleAuthorshipPercent } from "../userscript/wikiwho.ts";

const naked = `| rowspan="2" | '''Interior''' || [[José Elías Balmaceda]] || 1915 – 1916
|-
|| [[Maximiliano Ibáñez]] || 1916 – 1916
|- valign=top`;

describe("naked tables", () => {
  it("drops table rows that are not inside a table", () => {
    expect(stripNakedTables(naked).content).toBe("");
    expect(stripNakedTables(naked).removed).toBe(true);
  });

  it("keeps a complete wiki table", () => {
    const table = `{| class="wikitable"
|-
| A || B
|}`;
    const result = stripNakedTables(`Intro.\n\n${table}`);
    expect(result.removed).toBe(false);
    expect(result.content).toContain('{| class="wikitable"');
    expect(result.content).toContain("| A || B");
    expect(result.content).toContain("|}");
  });

  it("keeps template parameters that start with a pipe", () => {
    const template = `{{Prod llm/dated
| concern = [[WP:LLMPRV|Presumptive removal of LLM-generated content]], see [[Wikipedia:AI noticeboard/Carigval.97]]. Please do not remove this tag without following [[WP:LLMPRVOBJ|the procedures for disputing presumptive removal of LLM-generated content]].
| timestamp = 20261015164137
| help = 
}}`;
    const result = stripNakedTables(`${template}\n\n${naked}`);
    expect(result.content).toContain(
      "| concern = [[WP:LLMPRV|Presumptive removal",
    );
    expect(result.content).toContain("| timestamp = 20261015164137");
    expect(result.content).toContain("| help = ");
    expect(result.content).not.toContain("rowspan");
    expect(result.removed).toBe(true);
    const kept = cleanTaintedHistory(
      [
        { revid: 1, content: `${template}\n\nHello.` },
        { revid: 2, content: `${template}\n\nHello.\n\nTainted paste.` },
      ],
      [2],
    );
    expect(kept.content).toContain(
      "| concern = [[WP:LLMPRV|Presumptive removal",
    );
    expect(kept.content).toContain("| timestamp = 20261015164137");
    expect(kept.content).toContain("| help = ");
    expect(
      kept.explanations.some((item) => item.action === "remove-naked-table"),
    ).toBe(false);
  });
});

describe("page creation filters", () => {
  const created: Contrib = {
    revid: 1,
    title: "Example",
    timestamp: "2024-06-01T00:00:00Z",
    comment: "",
    sizediff: 20,
    tags: [],
    ns: 0,
    isNew: true,
    pageid: 1,
  };

  it("can exclude or require page creations", () => {
    expect(matchContrib(created, defaultFilters(), [])).toBe(true);
    expect(
      matchContrib(
        created,
        { ...defaultFilters(), excludeCreations: true },
        [],
      ),
    ).toBe(false);
    expect(
      matchContrib(
        { ...created, isNew: false },
        { ...defaultFilters(), includeCreations: true },
        [],
      ),
    ).toBe(false);
  });

  it("can drop later edits on pages this user created", () => {
    const followup = { ...created, revid: 2, isNew: false };
    const createdBy = new Set(["Example"]);
    expect(
      matchContrib(
        followup,
        { ...defaultFilters(), excludeFollowups: true },
        [],
        createdBy,
      ),
    ).toBe(false);
    expect(
      matchContrib(
        created,
        { ...defaultFilters(), excludeFollowups: true },
        [],
        createdBy,
      ),
    ).toBe(true);
    expect(
      matchContrib(
        { ...followup, title: "Other" },
        { ...defaultFilters(), excludeFollowups: true },
        [],
        createdBy,
      ),
    ).toBe(true);
  });
});

describe("LLMPROD authorship", () => {
  it("ignores tables and categories", () => {
    const tokens = [
      { str: "Hello", editor: "9" },
      { str: "{|", editor: "4" },
      { str: "Later", editor: "4" },
      { str: "|}", editor: "4" },
      { str: "[[", editor: "4" },
      { str: "Category:Foo", editor: "4" },
      { str: "]]", editor: "4" },
    ];
    expect(articleAuthorshipPercent(tokens, new Set(["9"]))).toBe(100);
    expect(
      articleAuthorshipPercent(
        [
          { str: "{|", editor: "9" },
          { str: "Only", editor: "9" },
          { str: "|}", editor: "9" },
        ],
        new Set(["9"]),
      ),
    ).toBe(0);
  });
});
