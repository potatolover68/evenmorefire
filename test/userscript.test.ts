import { describe, expect, it } from "vitest";
import { applyRestoredSections } from "../scrubber/post-restore.ts";
import { cleanTaintedHistory } from "../scrubber/index.ts";
import type { SectionSpan } from "../scrubber/sections.ts";
import { ACTION_LABELS, actionLabel } from "../userscript/comments.ts";
import {
  isAutomated,
  matchContrib,
  mergeHighlights,
  toolsForWiki,
  type Contrib,
} from "../userscript/filters.ts";
import { defaultFilters } from "../userscript/filters.ts";
import type { FilterConfig, PageJob } from "../userscript/types.ts";
import { countEdits } from "../userscript/types.ts";
import { markArticleCompleted } from "../userscript/aic.ts";
import { editSummary } from "../userscript/summary.ts";
import { tokenEditors } from "../userscript/wikiwho.ts";

function contrib(patch: Partial<Contrib> = {}): Contrib {
  return {
    revid: 1,
    title: "Example",
    timestamp: "2024-06-01T00:00:00Z",
    comment: "added text",
    sizediff: 40,
    tags: [],
    ns: 0,
    isNew: false,
    pageid: 10,
    ...patch,
  };
}

const filters: FilterConfig = {
  ...defaultFilters(),
  minBytes: 10,
  maxBytes: 100,
  after: "2024-01-01T00:00:00Z",
  before: "2024-12-31T00:00:00Z",
};

describe("contribution filters", () => {
  it("keeps an edit inside the byte, date, namespace, and summary bounds", () => {
    expect(
      matchContrib(
        contrib(),
        { ...filters, summaryRegex: "added", summaryCaseSensitive: false },
        [],
      ),
    ).toBe(true);
  });

  it("compares byte change with its sign", () => {
    expect(matchContrib(contrib({ sizediff: -9 }), filters, [])).toBe(false);
    expect(matchContrib(contrib({ sizediff: 101 }), filters, [])).toBe(false);
    expect(matchContrib(contrib({ sizediff: -40 }), filters, [])).toBe(false);
    expect(matchContrib(contrib({ sizediff: 40 }), filters, [])).toBe(true);
    expect(
      matchContrib(
        contrib({ sizediff: -40 }),
        { ...filters, minBytes: -50, maxBytes: -10 },
        [],
      ),
    ).toBe(true);
  });

  it("treats both timestamps as inclusive", () => {
    expect(
      matchContrib(contrib({ timestamp: "2024-01-01T00:00:00Z" }), filters, []),
    ).toBe(true);
    expect(
      matchContrib(contrib({ timestamp: "2023-12-31T23:59:59Z" }), filters, []),
    ).toBe(false);
  });

  it("matches the summary with or without case sensitivity", () => {
    const source = { ...filters, summaryRegex: "Added" };
    expect(
      matchContrib(contrib(), { ...source, summaryCaseSensitive: false }, []),
    ).toBe(true);
    expect(
      matchContrib(contrib(), { ...source, summaryCaseSensitive: true }, []),
    ).toBe(false);
  });

  it("limits namespaces when a subset is selected", () => {
    expect(
      matchContrib(contrib({ ns: 1 }), { ...filters, namespaces: [0] }, []),
    ).toBe(false);
  });

  it("drops automated edits from XTools tool rules", () => {
    const tools = toolsForWiki(
      {
        global: {
          Rollback: { tags: ["mw-rollback"], tag_excludes: ["twinkle"] },
        },
        "en.wikipedia.org": {
          Twinkle: { tags: ["twinkle"], namespaces: [0, 1] },
          AWB: { regex: "AWB" },
        },
      },
      "en.wikipedia.org",
    );
    expect(tools).toHaveLength(3);
    expect(isAutomated(contrib({ tags: ["twinkle"] }), tools)).toBe(true);
    expect(isAutomated(contrib({ tags: ["twinkle"], ns: 4 }), tools)).toBe(
      false,
    );
    expect(
      isAutomated(contrib({ tags: ["mw-rollback", "twinkle"] }), tools),
    ).toBe(true);
    expect(isAutomated(contrib({ tags: ["mw-rollback"] }), tools)).toBe(true);
    expect(isAutomated(contrib({ comment: "using AWB" }), tools)).toBe(true);
    expect(
      matchContrib(
        contrib({ tags: ["twinkle"] }),
        { ...filters, excludeAuto: true },
        tools,
      ),
    ).toBe(false);
  });

  it("keeps manual and excluded rows when filters are reapplied", () => {
    expect(
      mergeHighlights({ "1": "manual", "2": "excluded", "3": "filters" }, [4]),
    ).toEqual({
      "1": "manual",
      "2": "excluded",
      "4": "filters",
    });
  });
});

describe("edit summaries", () => {
  it("uses the reason-specific summary", () => {
    expect(editSummary("AI", "spam")).toBe(
      "[[User:MSK/emf|emf!]]: [[WP:LLMPRV|presumptive removal of AI-generated content]]. spam",
    );
    expect(editSummary("CV", "copy")).toBe(
      "[[User:MSK/emf|emf!]]: removing suspected copyright violations. copy",
    );
    expect(editSummary("other", "note")).toBe("[[User:MSK/emf|emf!]]: note");
  });
});

describe("AIC rows", () => {
  it("marks a matching article row completed", () => {
    const source = `{{AIC article list|
{{AIC article row|article=Example|status=requested|notes=x}}
{{AIC article row|Other|to do|leave}}
}}`;
    expect(markArticleCompleted(source, "Example")).toContain(
      "status=completed",
    );
    expect(markArticleCompleted(source, "Example")).toContain("to do");
    expect(markArticleCompleted(source, "Missing")).toBeNull();
  });
});

describe("comment labels", () => {
  it("has a sentence for every scrubber action", () => {
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      expect(label.length).toBeGreaterThan(8);
      expect(actionLabel(action)).toBe(label);
    }
    expect(ACTION_LABELS["remove-tainted"]).toMatch(/tainted revision/);
    expect(ACTION_LABELS["deprecated-param"]).toMatch(/zombie/);
    expect(actionLabel("restore", ["rev:9", "origin:4"])).toBe(
      "Restored text from revision 4 which was removed by tainted revision 9",
    );
    expect(
      actionLabel("deprecated-param", [
        'revid:3 timestamp:2020-01-01T00:20:00Z template:"Infobox person" [["first_name","fname1"]]',
      ]),
    ).toBe(
      "Updated zombie parameters of {{Infobox person}} (first_name → fname1) from 2020-01-01T00:20:00Z using revision 3",
    );
    expect(Object.keys(ACTION_LABELS)).toHaveLength(20);
  });
});

describe("restored section callback", () => {
  it("shifts later explanations when a restored section grows", async () => {
    const content = "Lead.\n\n== Later ==\n\nTail.";
    const sections: SectionSpan[] = [
      {
        heading: null,
        text: "Lead.\n\n",
        start: 0,
        end: "Lead.\n\n".length,
        restored: true,
        restoredAt: "2020-01-01T00:00:00Z",
      },
      {
        heading: "Later",
        text: "== Later ==\n\nTail.",
        start: "Lead.\n\n".length,
        end: content.length,
        restored: false,
        restoredAt: null,
      },
    ];
    const result = await applyRestoredSections(
      content,
      [
        {
          action: "restore",
          start: [4, 0],
          end: [4, 5],
          details: ["rev:2"],
        },
      ],
      sections,
      () => ({
        text: "Lead.\nMore.\n\n",
        comments: [
          {
            startLine: 2,
            startCh: 0,
            endLine: 2,
            endCh: 5,
            text: "renamed",
          },
        ],
      }),
    );
    expect(result.content).toBe("Lead.\nMore.\n\n== Later ==\n\nTail.");
    const restore = result.explanations.find(
      (note) => note.action === "restore",
    );
    expect(restore?.start[0]).toBe(5);
    const added = result.explanations.find(
      (note) => note.action === "deprecated-param",
    );
    expect(added?.start).toEqual([1, 0]);
    expect(added?.details).toEqual(["renamed"]);
  });

  it("runs the callback from cleanTaintedHistory and keeps it synchronous otherwise", async () => {
    const revisions = [
      {
        revid: 1,
        timestamp: "2020-01-01T00:00:00Z",
        content: "Keep. Gone.",
      },
      { revid: 2, content: "Keep." },
    ];
    const sync = cleanTaintedHistory(revisions, [2]);
    expect(sync.content).toBe("Keep. Gone.");
    const asyncResult = await cleanTaintedHistory(revisions, [2], {
      onRestoredSection: (section) => ({
        text: `${section.text}\nNote.`,
        comments: [
          {
            startLine: 2,
            startCh: 0,
            endLine: 2,
            endCh: 5,
            text: section.restoredAt ?? "",
          },
        ],
      }),
    });
    expect(asyncResult.content).toContain("Gone.");
    expect(asyncResult.content).toContain("Note.");
    expect(
      asyncResult.explanations.some(
        (note) => note.action === "deprecated-param",
      ),
    ).toBe(true);
  });
});

describe("queue counts", () => {
  it("counts selected edits by status on each page", () => {
    const job = (status: PageJob["status"], ids: number[]): PageJob => ({
      title: status + ids.join("-"),
      status,
      taintedRevids: ids,
      isNew: false,
      pageid: null,
      anchorRevid: null,
      content: null,
      explanations: [],
      baseRevid: null,
      baseTimestamp: null,
      savedRevid: null,
    });
    expect(
      countEdits([
        job("applied", [1, 2]),
        job("skipped", [3]),
        job("flagged", [4]),
        job("review", [5, 6, 7]),
        job("pending", [8]),
      ]),
    ).toEqual({
      applied: 2,
      skipped: 1,
      flagged: 1,
      review: 3,
      total: 8,
    });
  });
});

describe("WikiWho tokens", () => {
  it("counts token editors and ignores the wrapper", () => {
    expect(
      tokenEditors({
        revisions: [
          {
            "5": {
              tokens: [
                { str: "Hello", editor: "9" },
                { str: "there", editor: "0|1.2.3.4" },
              ],
            },
          },
        ],
      }),
    ).toEqual(["9", "0|1.2.3.4"]);
  });
});
