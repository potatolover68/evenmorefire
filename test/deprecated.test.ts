import { describe, expect, it } from "vitest";
import {
  refreshDeprecatedParameters,
  type SnippetComment,
  type TemplateRevision,
} from "../deprecated/refresh.ts";

const body = (rules: string) =>
  `<includeonly>{{#invoke:Check for deprecated parameters|check\n${rules}\n}}</includeonly>\n{{{fname1|}}}\n`;

const history: TemplateRevision[] = [
  {
    revid: 1,
    timestamp: "2020-01-01T00:00:00Z",
    content: body("| first_name = fname1"),
  },
  {
    revid: 2,
    timestamp: "2020-01-01T00:10:00Z",
    content: body("| first_name = fnane1"),
  },
  {
    revid: 3,
    timestamp: "2020-01-01T00:20:00Z",
    content: body("| first_name = fname1\n| _remove = old"),
  },
  {
    revid: 4,
    timestamp: "2024-01-01T00:00:00Z",
    content: "{{Infobox person\n| {{{fname1|}}}\n}}",
  },
];

const fetchRevisions = async (title: string): Promise<TemplateRevision[]> => {
  if (title === "Template:Infobox person") return history;
  return [];
};

describe("refreshDeprecatedParameters", () => {
  it("prefers the long-lived rename over a short typo", async () => {
    const result = await refreshDeprecatedParameters(
      "{{Infobox person|first_name=Ann}}",
      [],
      "2019-01-01T00:00:00Z",
      fetchRevisions,
    );
    expect(result.text).toBe("{{Infobox person|fname1=Ann}}");
    expect(result.text).not.toContain("fnane1");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toMatchObject({
      startLine: 1,
      startCh: 0,
      endLine: 1,
    });
    expect(result.comments[0]!.text).toBe(
      'revid:3 timestamp:2020-01-01T00:20:00Z template:"Infobox person" [["first_name","fname1"]]',
    );
    expect(result.comments[0]!.endCh).toBe(result.text.length);
  });

  it("removes a parameter and shifts a later-line comment up", async () => {
    const text = "{{Infobox person\n| name = Ann\n| old = x\n| last = Bee\n}}";
    const comments: SnippetComment[] = [
      { startLine: 4, startCh: 2, endLine: 4, endCh: 6, text: "last name" },
    ];
    const result = await refreshDeprecatedParameters(
      text,
      comments,
      "2019-01-01T00:00:00Z",
      fetchRevisions,
    );
    expect(result.text).toBe(
      "{{Infobox person\n| name = Ann\n| last = Bee\n}}",
    );
    const kept = result.comments.find(
      (comment) => comment.text === "last name",
    );
    expect(kept).toMatchObject({
      startLine: 3,
      startCh: 2,
      endLine: 3,
      endCh: 6,
    });
    const added = result.comments.find((comment) =>
      comment.text.includes('[["old",""]]'),
    );
    expect(added?.text).toContain("revid:3");
  });

  it("keeps a later-line comment put when a rename stays on one line", async () => {
    const text = "{{Infobox person|first_name=Ann}}\nnext";
    const comments: SnippetComment[] = [
      { startLine: 2, startCh: 0, endLine: 2, endCh: 4, text: "below" },
    ];
    const result = await refreshDeprecatedParameters(
      text,
      comments,
      "2019-01-01T00:00:00Z",
      fetchRevisions,
    );
    expect(result.text).toBe("{{Infobox person|fname1=Ann}}\nnext");
    expect(
      result.comments.find((comment) => comment.text === "below"),
    ).toMatchObject({
      startLine: 2,
      startCh: 0,
      endLine: 2,
      endCh: 4,
    });
  });

  it("attaches a separate comment to each changed invocation", async () => {
    const text = "{{Infobox person|first_name=Ann}}\n{{Infobox person|old=x}}";
    const result = await refreshDeprecatedParameters(
      text,
      [],
      "2019-01-01T00:00:00Z",
      fetchRevisions,
    );
    expect(result.text).toBe(
      "{{Infobox person|fname1=Ann}}\n{{Infobox person}}",
    );
    expect(result.comments.map((comment) => comment.text)).toEqual([
      'revid:3 timestamp:2020-01-01T00:20:00Z template:"Infobox person" [["first_name","fname1"]]',
      'revid:3 timestamp:2020-01-01T00:20:00Z template:"Infobox person" [["old",""]]',
    ]);
  });

  it("leaves a name with no legal target unchanged", async () => {
    const text = "{{Infobox person|nickname=Ann}}";
    const result = await refreshDeprecatedParameters(
      text,
      [],
      "2019-01-01T00:00:00Z",
      fetchRevisions,
    );
    expect(result.text).toBe(text);
    expect(result.comments).toEqual([]);
  });
});
