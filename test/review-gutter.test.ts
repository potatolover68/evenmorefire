import { describe, expect, it } from "vitest";
import {
  alignSides,
  indexAfterLines,
  visualSpan,
  visualSpanIndexed,
  type InlinePart,
} from "../userscript/align.ts";
import { displaySlots } from "../userscript/folds.ts";
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

  it("marks only the changed words of a similar line", () => {
    const rows = alignSides("The quick brown fox", "The quick red fox");
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.before).toBe("The quick brown fox");
    expect(row.after).toBe("The quick red fox");
    expect(changedText(row.beforeParts)).toBe("brown");
    expect(changedText(row.afterParts)).toBe("red");
    expect(joined(row.beforeParts)).toBe(row.before);
    expect(joined(row.afterParts)).toBe(row.after);
  });

  it("leaves an unrelated replacement as a full-line delete and insert", () => {
    const rows = alignSides(
      "Alpha sentence about widgets.",
      "Completely different discussion of policy.",
    );
    expect(rows.map((row) => [row.before, row.after])).toEqual([
      ["Alpha sentence about widgets.", null],
      [null, "Completely different discussion of policy."],
    ]);
    expect(
      rows.every((row) => row.beforeParts == null && row.afterParts == null),
    ).toBe(true);
  });

  it("does not fold a paired row whose text differs", () => {
    const rows = alignSides(
      [
        "same one",
        "same two",
        "same three",
        "The quick brown fox",
        "tail one",
        "tail two",
        "tail three",
      ].join("\n"),
      [
        "same one",
        "same two",
        "same three",
        "The quick red fox",
        "tail one",
        "tail two",
        "tail three",
      ].join("\n"),
    );
    const changed = rows.findIndex((row) => row.before?.includes("brown"));
    expect(changed).toBeGreaterThanOrEqual(0);
    expect(rows[changed]?.before).not.toBe(rows[changed]?.after);
    const slots = displaySlots(rows, new Set());
    expect(
      slots.some((slot) => slot.kind === "line" && slot.index === changed),
    ).toBe(true);
  });
});

function changedText(parts: readonly InlinePart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => part.changed)
    .map((part) => part.text)
    .join("");
}

function joined(parts: readonly InlinePart[] | undefined): string {
  return (parts ?? []).map((part) => part.text).join("");
}

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
