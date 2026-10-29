import { describe, expect, it } from "vitest";
import { diffIdFromHref, diffIdsFromHrefs } from "../userscript/ainb-links.ts";

describe("AINB diff links", () => {
  it("reads Special:Diff and diff query revisions", () => {
    expect(diffIdFromHref("/wiki/Special:Diff/1341986645")).toBe(1341986645);
    expect(
      diffIdFromHref("/w/index.php?title=Reactionary&diff=1318519439"),
    ).toBe(1318519439);
    expect(diffIdFromHref("/wiki/Reactionary")).toBeNull();
    expect(
      diffIdsFromHrefs([
        "/wiki/Special:Diff/11",
        "/wiki/Special:Diff/11",
        "/w/index.php?diff=22&oldid=21",
      ]),
    ).toEqual([11, 22]);
  });
});
