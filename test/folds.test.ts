import { describe, expect, it } from "vitest";
import type { AlignedRow } from "../userscript/align.ts";
import {
  displaySlots,
  foldLabel,
  spanBox,
  layoutDisplay,
} from "../userscript/folds.ts";

function row(text: string | null, changed = false): AlignedRow {
  if (changed)
    return { before: text, after: null, beforeLine: 0, afterLine: null };
  return { before: text, after: text, beforeLine: 0, afterLine: 0 };
}

describe("unchanged folds", () => {
  const rows = [
    row("a"),
    row("b"),
    row("c"),
    row("d"),
    row("e"),
    row("gone", true),
    row("f"),
    row("g"),
  ];

  it("keeps the first and last line of a long unchanged run", () => {
    const slots = displaySlots(rows, new Set());
    expect(slots.map((slot) => slot.kind)).toEqual([
      "line",
      "fold",
      "line",
      "line",
      "line",
      "line",
    ]);
    expect(slots[0]).toMatchObject({ kind: "line", index: 0 });
    expect(slots[1]).toMatchObject({ kind: "fold", key: 0, start: 1, end: 3 });
    expect(slots[2]).toMatchObject({ kind: "line", index: 4 });
    expect(
      foldLabel(slots[1] as Extract<(typeof slots)[number], { kind: "fold" }>),
    ).toBe("3 unchanged lines");
  });

  it("shows every line of an expanded run, with a control to hide them", () => {
    const slots = displaySlots(rows, new Set([0]));
    expect(
      slots.map((slot) => (slot.kind === "line" ? slot.index : "fold")),
    ).toEqual([0, "fold", 1, 2, 3, 4, 5, 6, 7]);
  });

  it("places a bar on the fold when its rows are hidden", () => {
    const layout = layoutDisplay(rows, new Set(), 80);
    const hidden = spanBox(layout, 1, 3);
    const foldTop = layout.prefix[1] ?? 0;
    expect(hidden.top).toBe(foldTop);
    expect(hidden.height).toBe(18);
    const across = spanBox(layout, 0, 4);
    expect(across.top).toBe(0);
    expect(across.height).toBe((layout.prefix[3] ?? 0) - 0);
  });
});
