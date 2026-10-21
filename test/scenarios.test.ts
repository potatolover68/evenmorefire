import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanTaintedHistory,
  type Options,
  type Revision,
} from "../scrubber/index";

interface ExpectedExplanation {
  action: string;
  detailsInclude?: string[];
  zeroWidth?: boolean;
}

interface Fixture {
  name: string;
  revisions: Revision[];
  tainted: number[];
  options?: Options;
  expect: {
    content?: string;
    contentIncludes?: string[];
    contentExcludes?: string[];
    require?: ExpectedExplanation[];
    requireAny?: string[];
    forbid?: string[];
  };
}

const dir = new URL("./fixtures/", import.meta.url);
const fixtures: Fixture[] = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .map(
    (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Fixture,
  );

describe("scenarios", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const result = cleanTaintedHistory(
        fixture.revisions,
        fixture.tainted,
        fixture.options,
      );
      if (fixture.expect.content !== undefined)
        expect(result.content).toBe(fixture.expect.content);
      for (const piece of fixture.expect.contentIncludes ?? [])
        expect(result.content).toContain(piece);
      for (const piece of fixture.expect.contentExcludes ?? [])
        expect(result.content).not.toContain(piece);
      for (const action of fixture.expect.forbid ?? []) {
        expect(result.explanations.some((item) => item.action === action)).toBe(
          false,
        );
      }
      for (const required of fixture.expect.require ?? []) {
        const hit = result.explanations.find(
          (item) =>
            item.action === required.action &&
            (required.detailsInclude ?? []).every((detail) =>
              item.details?.includes(detail),
            ) &&
            (required.zeroWidth !== true ||
              (item.start[0] === item.end[0] && item.start[1] === item.end[1])),
        );
        expect(hit, JSON.stringify(result, null, 2)).toBeTruthy();
      }
      if (fixture.expect.requireAny) {
        expect(
          fixture.expect.requireAny.some((action) =>
            result.explanations.some((item) => item.action === action),
          ),
        ).toBe(true);
      }
    });
  }

  it("removes a tainted 5 kB paste instead of attributing it to the next editor", () => {
    const block = `${"lorem ".repeat(900)}ipsum.`;
    expect(block.length).toBeGreaterThan(5000);
    const revisions: Revision[] = [
      { revid: 1, content: "Intro." },
      { revid: 2, content: `Intro.\n\n${block}` },
      { revid: 3, content: `Intro.\n\n${block}\n\nTail.` },
    ];
    const result = cleanTaintedHistory(revisions, [2]);
    expect(result.content).toContain("Intro.");
    expect(result.content).toContain("Tail.");
    expect(result.content).not.toContain("lorem");
  });

  it("drops a renamed sentence that a clean editor only lightly copyedited", () => {
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content: "The film opens quietly.\n\n== Plot ==\n\nAlice meets Bob!",
        },
        {
          revid: 2,
          content:
            "The film opens quietly.\n\n== Plot ==\n\nThe protagonist encounters her companion during the opening act of the story and discusses many topics.",
        },
        {
          revid: 3,
          content:
            "The film opens quietly.\n\n== Plot ==\n\nThe protagonist encounters her dear companion during the opening act of the story and discusses many topics.",
        },
      ],
      [2],
    );
    expect(result.content).not.toContain("dear");
    expect(result.content).not.toContain("protagonist");
  });
});
