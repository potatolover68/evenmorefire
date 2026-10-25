import { describe, expect, it } from "vitest";
import {
  alignSides,
  indexAfterLines,
  visualSpan,
  visualSpanIndexed,
} from "../userscript/align.ts";
import {
  columnColor,
  columnVariants,
  packMarkers,
} from "../userscript/gutter.ts";
import { rowHeights } from "../userscript/rows.ts";
import type { Explanation } from "../scrubber/types.ts";

describe("aligned diff", () => {
  it("pads the shorter side so before and after stay on the same rows", () => {
    const rows = alignSides("alpha\nkeep\nomega", "alpha\nadded\nkeep");
    expect(rows.map((row) => [row.before, row.after])).toEqual([
      ["alpha", "alpha"],
      [null, "added"],
      ["keep", "keep"],
      ["omega", null],
    ]);
    expect(rows.map((row) => row.beforeLine)).toEqual([0, null, 1, 2]);
    expect(rows.map((row) => row.afterLine)).toEqual([0, 1, 2, null]);
  });

  it("maps a proposal line onto the padded row", () => {
    const rows = alignSides("alpha\nkeep\nomega", "alpha\nadded\nkeep");
    expect(visualSpan(rows, 1, 1)).toEqual({ from: 1, to: 1 });
    expect(visualSpan(rows, 0, 2)).toEqual({ from: 0, to: 2 });
    const index = indexAfterLines(rows);
    expect(visualSpanIndexed(index, 1, 1)).toEqual(visualSpan(rows, 1, 1));
    expect(visualSpanIndexed(index, 0, 2)).toEqual(visualSpan(rows, 0, 2));
  });
});

describe("gutter colors", () => {
  it("shifts neighboring bars of the same action when the details differ", () => {
    const variants = columnVariants([
      { action: "restore", details: ["rev:1"] },
      { action: "restore", details: ["rev:2"] },
      { action: "restore", details: ["rev:2"] },
      { action: "remove-tainted", details: ["rev:3"] },
    ]);
    expect(variants).toEqual([0, 1, 1, 0]);
    expect(columnColor("restore", 0)).not.toBe(columnColor("restore", 1));
    expect(columnColor("restore", 0)).not.toBe(
      columnColor("remove-tainted", 0),
    );
  });
});

describe("gutter lanes", () => {
  it("groups identical spans and shares a lane until ranges overlap", () => {
    const note = (action: string): Explanation => ({
      action,
      start: [0, 0],
      end: [0, 0],
    });
    const markers = packMarkers([
      { from: 0, to: 1, note: note("remove-tainted"), variant: 0 },
      { from: 0, to: 1, note: note("markup-repair"), variant: 0 },
      { from: 4, to: 6, note: note("restore"), variant: 0 },
      { from: 5, to: 7, note: note("flag-derivative"), variant: 0 },
    ]);
    expect(markers).toHaveLength(3);
    expect(markers.find((marker) => marker.from === 0)?.notes).toHaveLength(2);
    expect(markers.find((marker) => marker.from === 0)?.lane).toBe(0);
    expect(markers.find((marker) => marker.from === 4)?.lane).toBe(0);
    expect(markers.find((marker) => marker.from === 5)?.lane).toBe(1);
  });
});

describe("wrapped rows", () => {
  it("uses the taller wrapped side as the row height", () => {
    expect(
      rowHeights(
        [{ before: "abcd", after: "ab", beforeLine: 0, afterLine: 0 }],
        2,
      ),
    ).toEqual([36]);
  });

  it("budgets two columns for a non-Latin glyph", () => {
    const wide = "আ".repeat(4);
    expect(
      rowHeights(
        [{ before: wide, after: "abcd", beforeLine: 0, afterLine: 0 }],
        4,
      ),
    ).toEqual([36]);
    expect(
      rowHeights(
        [{ before: "abcd", after: null, beforeLine: 0, afterLine: null }],
        4,
      ),
    ).toEqual([18]);
  });
});
