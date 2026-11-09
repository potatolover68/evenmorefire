import { describe, expect, it } from "vitest";
import {
  clearTemplateRevisionCache,
  refreshDeprecatedParameters,
  type SnippetComment,
  type TemplateRevision,
} from "../deprecated/refresh.ts";
import {
  compactHistory,
  hasRuleMachinery,
  legalNames,
  parseRevision,
} from "../deprecated/rules.ts";
import { findTemplates, templatePageTitle } from "../deprecated/wikitext.ts";

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

  it("fetches each template title once per refresh", async () => {
    const calls: string[] = [];
    const fetch = async (title: string): Promise<TemplateRevision[]> => {
      calls.push(title);
      if (title === "Template:Infobox person") return history;
      return [{ revid: 1, timestamp: "2024-01-01T00:00:00Z", content: "plain" }];
    };
    await refreshDeprecatedParameters(
      "{{Infobox person|first_name=Ann}} {{cite web|url=x}} {{cite web|title=y}}",
      [],
      "2019-01-01T00:00:00Z",
      fetch,
    );
    expect(calls.sort()).toEqual([
      "Template:Infobox person",
      "Template:cite web",
    ]);
  });
});

describe("compactHistory", () => {
  it("collapses consecutive identical rule sets", () => {
    const many: TemplateRevision[] = [];
    for (let i = 1; i <= 100; i++) {
      const minute = String(Math.floor((i - 1) / 60)).padStart(2, "0");
      const second = String((i - 1) % 60).padStart(2, "0");
      many.push({
        revid: i,
        timestamp: `2020-01-01T00:${minute}:${second}Z`,
        content: body("| first_name = fname1"),
      });
    }
    many.push({
      revid: 101,
      timestamp: "2020-02-01T00:00:00Z",
      content: body("| first_name = fname1\n| _remove = old"),
    });
    const compact = compactHistory("Template:Infobox person", many);
    expect(compact.revisions.length).toBe(2);
    expect(compact.revisions[0]?.revid).toBe(100);
    expect(compact.revisions[0]?.timestamp).toBe("2020-01-01T00:00:00Z");
    expect(compact.revisions[0]?.revisedAt).toBe("2020-01-01T00:01:39Z");
    expect(compact.revisions[1]?.revid).toBe(101);
    expect(compact.revisions[1]?.revisedAt).toBe("2020-02-01T00:00:00Z");
    expect(compact.tipRevid).toBe(101);
  });

  it("still prefers the long-lived rename after collapse", async () => {
    const padded: TemplateRevision[] = [];
    for (let i = 0; i < 50; i++) {
      padded.push({
        revid: 1000 + i,
        timestamp: `2019-06-01T00:${String(i).padStart(2, "0")}:00Z`,
        content: body("| first_name = fname1"),
      });
    }
    padded.push(...history);
    const result = await refreshDeprecatedParameters(
      "{{Infobox person|first_name=Ann}}",
      [],
      "2019-01-01T00:00:00Z",
      async (title) =>
        title === "Template:Infobox person" ? padded : [],
    );
    expect(result.text).toBe("{{Infobox person|fname1=Ann}}");
  });
});

describe("rule machinery gate", () => {
  it("detects templates with no deprecation rules", () => {
    expect(hasRuleMachinery(parseRevision("{{cite web|url=x}}"))).toBe(false);
    expect(hasRuleMachinery(parseRevision(body("| a = b")))).toBe(true);
    expect(
      hasRuleMachinery(
        parseRevision(
          '<templatedata>{"params":{"name":{"aliases":["foo"]}}}</templatedata>',
        ),
      ),
    ).toBe(true);
  });
});

describe("API query shapes", () => {
  it("keeps single-page-only rv params off multi-title queries", async () => {
    clearTemplateRevisionCache();
    const calls: URLSearchParams[] = [];
    const original = globalThis.fetch;
    // legal names come from the tip revision, so it must declare fname1
    const tip = "{{cite web|url=x}}\n{{{fname1|}}}";
    const rules = body("| first_name = fname1");
    const revision = (revid: number, timestamp: string, content: string) => ({
      revid,
      timestamp,
      slots: { main: { content } },
    });
    globalThis.fetch = (async (input: unknown) => {
      const params = new URL(input as string).searchParams;
      calls.push(params);
      const isHistory = params.get("rvdir") === "older";
      const titles = params.get("titles") ?? "";
      const pages: unknown[] = [];
      if (!isHistory) {
        for (const title of titles.split("|")) {
          pages.push({
            title,
            revisions: [revision(2, "2024-01-01T00:00:00Z", tip)],
          });
        }
      } else {
        pages.push({
          title: titles,
          revisions: [
            revision(1, "2020-01-01T00:00:00Z", rules),
          ],
        });
      }
      return {
        ok: true,
        json: async () => ({ query: { pages } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    let text = "";
    try {
      const result = await refreshDeprecatedParameters(
        "{{cite web|first_name=Ann}} {{cite book|first_name=Bob}}",
        [],
        "2019-01-01T00:00:00Z",
        { apiRoot: "https://example.org/w/api.php" },
      );
      text = result.text;
    } finally {
      globalThis.fetch = original;
    }
    expect(text).toBe("{{cite web|fname1=Ann}} {{cite book|fname1=Bob}}");
    for (const params of calls) {
      const titles = params.get("titles") ?? "";
      if (!titles.includes("|")) continue;
      expect(params.has("rvlimit")).toBe(false);
      expect(params.has("rvdir")).toBe(false);
      expect(params.has("rvstart")).toBe(false);
    }
  });

  it("skips history lookup when all invoked parameters are already legal", async () => {
    clearTemplateRevisionCache();
    const calls: URLSearchParams[] = [];
    const original = globalThis.fetch;
    const legalTip = "{{reflist}}\n{{{date|}}}\n{{{url|}}}";
    globalThis.fetch = (async (input: unknown) => {
      const params = new URL(input as string).searchParams;
      calls.push(params);
      const titles = (params.get("titles") ?? "").split("|");
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: titles.map((title, i) => ({
              title,
              revisions: [
                {
                  revid: i + 1,
                  timestamp: "2026-01-01T00:00:00Z",
                  slots: { main: { content: legalTip } },
                },
              ],
            })),
          },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      // Both templates use parameters that are 100% legal in legalTip (or zero params)
      const res = await refreshDeprecatedParameters(
        "{{use dmy dates|date=2026}} {{reflist}}",
        [],
        "2024-01-01T00:00:00Z",
        { apiRoot: "https://example.org/w/api.php" },
      );
      expect(res.text).toBe("{{use dmy dates|date=2026}} {{reflist}}");
    } finally {
      globalThis.fetch = original;
    }

    // Only the single initial batch probe was sent! Zero history calls!
    expect(calls.length).toBe(1);
    expect(calls[0]!.get("titles")).toContain("Template:use dmy dates");
    expect(calls[0]!.get("titles")).toContain("Template:reflist");
  });

  it("queries history backwards using rvdir=older when unknown parameters exist", async () => {
    clearTemplateRevisionCache();
    const calls: URLSearchParams[] = [];
    const original = globalThis.fetch;
    const tipWithoutUnknown = "{{Infobox person}}\n{{{name|}}}";
    const olderWithRule = body("| unknown_param = name");

    globalThis.fetch = (async (input: unknown) => {
      const params = new URL(input as string).searchParams;
      calls.push(params);
      const isHistory = params.get("rvdir") === "older";
      if (!isHistory) {
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: [
                {
                  title: "Template:Infobox person",
                  revisions: [
                    {
                      revid: 200,
                      timestamp: "2026-11-01T00:00:00Z",
                      slots: { main: { content: tipWithoutUnknown } },
                    },
                  ],
                },
              ],
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: [
              {
                title: "Template:Infobox person",
                revisions: [
                  {
                    revid: 100,
                    timestamp: "2026-10-01T00:00:00Z",
                    slots: { main: { content: olderWithRule } },
                  },
                ],
              },
            ],
          },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const res = await refreshDeprecatedParameters(
        "{{Infobox person|unknown_param=Ann}}",
        [],
        "2026-09-01T00:00:00Z",
        { apiRoot: "https://example.org/w/api.php" },
      );
      expect(res.text).toBe("{{Infobox person|name=Ann}}");
    } finally {
      globalThis.fetch = original;
    }

    // The history fetch query must be rvdir=older
    const historyCall = calls.find((c) => c.has("rvdir"));
    expect(historyCall).toBeDefined();
    expect(historyCall!.get("rvdir")).toBe("older");
  });
});

describe("history cache", () => {
  // Tip no longer invokes Check for deprecated parameters (the old names were
  // cleaned up), but an earlier revision declared the pushpin renames.
  const tip = "{{{pushpin_caption|}}}\n{{{pushpin_alt|}}}\n{{{name|}}}";
  const ruled = body(
    "| pushpin_map_alt = pushpin_alt\n| pushpin_map_caption = pushpin_caption",
  );
  const older = [
    { revid: 300, timestamp: "2026-10-01T00:00:00Z", content: tip },
    { revid: 250, timestamp: "2026-08-01T00:00:00Z", content: tip },
    { revid: 200, timestamp: "2025-06-01T00:00:00Z", content: ruled },
    { revid: 100, timestamp: "2024-01-01T00:00:00Z", content: tip },
  ];

  function mockWiki(calls: URLSearchParams[]): typeof fetch {
    return (async (input: unknown) => {
      const params = new URL(input as string).searchParams;
      calls.push(params);
      const title = "Template:Infobox settlement";
      const isHistory = params.get("rvdir") === "older";
      const revisions = (isHistory ? older : older.slice(0, 1)).map((rev) => ({
        revid: rev.revid,
        timestamp: rev.timestamp,
        slots: { main: { content: rev.content } },
      }));
      return {
        ok: true,
        json: async () => ({ query: { pages: [{ title, revisions }] } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("does not let a clean page poison the cache for a later deprecated one", async () => {
    clearTemplateRevisionCache();
    const calls: URLSearchParams[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = mockWiki(calls);
    const options = { apiRoot: "https://example.org/w/api.php" };
    try {
      // First article only uses current names: history lookup is skipped.
      const clean = await refreshDeprecatedParameters(
        "{{Infobox settlement|name=Foo|pushpin_caption=Bar}}",
        [],
        "2026-09-01T00:00:00Z",
        options,
      );
      expect(clean.text).toBe("{{Infobox settlement|name=Foo|pushpin_caption=Bar}}");
      // Second article still carries the formerly deprecated names.
      const stale = await refreshDeprecatedParameters(
        "{{Infobox settlement|pushpin_map_caption=Bar|pushpin_map_alt=Baz}}",
        [],
        "2026-09-01T00:00:00Z",
        options,
      );
      expect(stale.text).toBe(
        "{{Infobox settlement|pushpin_caption=Bar|pushpin_alt=Baz}}",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refetches when a cached history does not reach back to an older snippet", async () => {
    clearTemplateRevisionCache();
    const calls: URLSearchParams[] = [];
    const original = globalThis.fetch;
    let served = 0;
    // The first history page ends with a continuation; the loader stops
    // there because it is already past the first snippet.
    globalThis.fetch = (async (input: unknown) => {
      const params = new URL(input as string).searchParams;
      calls.push(params);
      const title = "Template:Infobox settlement";
      const isHistory = params.get("rvdir") === "older";
      let list = older.slice(0, 1);
      if (isHistory) {
        served += 1;
        list = served === 1 ? older.slice(0, 2) : older;
      }
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: [
              {
                title,
                revisions: list.map((rev) => ({
                  revid: rev.revid,
                  timestamp: rev.timestamp,
                  slots: { main: { content: rev.content } },
                })),
              },
            ],
          },
          ...(isHistory && served === 1 ? { continue: { rvcontinue: "x" } } : {}),
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const options = { apiRoot: "https://example.org/w/api.php" };
    try {
      // A recent snippet: the walk stops at revid 250, the first revision
      // older than the snippet, and never sees the rule era (revid 200).
      await refreshDeprecatedParameters(
        "{{Infobox settlement|unknown=1}}",
        [],
        "2026-09-01T00:00:00Z",
        options,
      );
      // An older snippet must not reuse that shallow history.
      const stale = await refreshDeprecatedParameters(
        "{{Infobox settlement|pushpin_map_caption=Bar}}",
        [],
        "2025-01-01T00:00:00Z",
        options,
      );
      expect(stale.text).toBe("{{Infobox settlement|pushpin_caption=Bar}}");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("template names", () => {
  it("ignores HTML comments between the name and the first parameter", () => {
    const [span] = findTemplates(
      "{{Infobox settlement\n<!--See the Table at Infobox Settlement for all fields-->\n<!-- Basic info -->\n|name = X\n}}",
    );
    expect(span!.name).toBe("Infobox settlement");
    expect(templatePageTitle(span!.name)).toBe("Template:Infobox settlement");
  });
});

describe("legal names from Check for unknown parameters", () => {
  // Shape of Template:Infobox settlement after 2026-10-11: pushpin params go
  // straight to Module:Location map and never appear as {{{name}}}.
  const tip =
    "{{#invoke:Location map|infobox_pushpin_map}}{{{type|}}}<!--\n-->" +
    "{{#invoke:Check for unknown parameters|check|unknown=x|preview = y|" +
    " ignoreblank=y | pushpin_map_args=y | alt <!-- c --> | name\n| type}}";

  it("adds the positional list and the pushpin_map_args names", () => {
    const legal = legalNames(tip);
    for (const name of ["alt", "name", "type", "pushpin_caption", "pushpin_alt"])
      expect(legal.has(name)).toBe(true);
    for (const name of ["unknown", "preview", "ignoreblank", "pushpin_map_args"])
      expect(legal.has(name)).toBe(false);
    expect(legal.has("mapframe-caption")).toBe(false);
  });

  it("renames to a target only the module knows about", async () => {
    const result = await refreshDeprecatedParameters(
      "{{Infobox settlement\n<!-- see doc -->\n| pushpin_map_caption = Location in Lebanon\n| settlement_type = Village\n}}",
      [],
      "2026-09-15T00:00:00Z",
      async () => [
        {
          revid: 1,
          timestamp: "2026-09-12T03:24:00Z",
          content:
            "{{{pushpin_map_caption|}}}{{{settlement_type|}}}" +
            body("| settlement_type = type\n| pushpin_map_caption = pushpin_caption"),
        },
        { revid: 2, timestamp: "2026-10-11T22:40:00Z", content: tip },
      ],
    );
    expect(result.text).toBe(
      "{{Infobox settlement\n<!-- see doc -->\n| pushpin_caption = Location in Lebanon\n| type = Village\n}}",
    );
  });
});

describe("cache control", () => {
  it("clearTemplateRevisionCache is safe to call repeatedly", () => {
    clearTemplateRevisionCache();
    clearTemplateRevisionCache();
  });
});
