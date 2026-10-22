import type { AlignedRow } from "./align.ts";
import { LINE_PX, rowHeights } from "./rows.ts";

export function isUnchanged(row: AlignedRow): boolean {
  return row.before != null && row.after != null;
}

export interface DisplayLine {
  kind: "line";
  index: number;
}

export interface DisplayFold {
  kind: "fold";
  /** First source row of the unchanged run. */
  key: number;
  /** Hidden source rows, inclusive. */
  start: number;
  end: number;
  expanded: boolean;
}

export type DisplaySlot = DisplayLine | DisplayFold;

/** Unchanged runs longer than two rows. Shorter runs stay fully visible. */
export function displaySlots(
  rows: readonly AlignedRow[],
  expanded: ReadonlySet<number>,
): DisplaySlot[] {
  const slots: DisplaySlot[] = [];
  let index = 0;
  while (index < rows.length) {
    if (!isUnchanged(rows[index]!)) {
      slots.push({ kind: "line", index });
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < rows.length && isUnchanged(rows[end + 1]!)) end += 1;
    if (end - index < 2) {
      for (let row = index; row <= end; row++) slots.push({ kind: "line", index: row });
    } else if (expanded.has(index)) {
      slots.push({ kind: "line", index });
      slots.push({
        kind: "fold",
        key: index,
        start: index + 1,
        end: end - 1,
        expanded: true,
      });
      for (let row = index + 1; row <= end; row++) {
        slots.push({ kind: "line", index: row });
      }
    } else {
      slots.push({ kind: "line", index });
      slots.push({
        kind: "fold",
        key: index,
        start: index + 1,
        end: end - 1,
        expanded: false,
      });
      slots.push({ kind: "line", index: end });
    }
    index = end + 1;
  }
  return slots;
}

export function foldLabel(slot: DisplayFold): string {
  const count = slot.end - slot.start + 1;
  const shown = count.toLocaleString("en-US");
  const noun = count === 1 ? "line" : "lines";
  return slot.expanded
    ? `Hide ${shown} unchanged ${noun}`
    : `${shown} unchanged ${noun}`;
}

export interface DisplayLayout {
  slots: DisplaySlot[];
  heights: number[];
  prefix: number[];
  /** Slot that displays each source row. Hidden rows point at their fold. */
  slotOfRow: number[];
}

export function layoutDisplay(
  rows: readonly AlignedRow[],
  expanded: ReadonlySet<number>,
  charsPerLine: number,
): DisplayLayout {
  const slots = displaySlots(rows, expanded);
  const lineHeights = rowHeights(rows, charsPerLine);
  const heights = slots.map((slot) =>
    slot.kind === "fold" ? LINE_PX : (lineHeights[slot.index] ?? LINE_PX),
  );
  const prefix = new Array<number>(heights.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < heights.length; i++) {
    prefix[i + 1] = prefix[i]! + heights[i]!;
  }
  const slotOfRow = new Array<number>(rows.length).fill(0);
  slots.forEach((slot, slotIndex) => {
    if (slot.kind === "line") {
      slotOfRow[slot.index] = slotIndex;
      return;
    }
    for (let row = slot.start; row <= slot.end; row++) slotOfRow[row] = slotIndex;
  });
  return { slots, heights, prefix, slotOfRow };
}

/** Top and height of a source-row span after folds are applied. */
export function spanBox(
  layout: DisplayLayout,
  from: number,
  to: number,
): { top: number; height: number } {
  const last = Math.max(0, layout.slotOfRow.length - 1);
  const start = layout.slotOfRow[Math.min(Math.max(0, from), last)] ?? 0;
  const end = layout.slotOfRow[Math.min(Math.max(0, to), last)] ?? start;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const top = layout.prefix[lo] ?? 0;
  const bottom = layout.prefix[hi + 1] ?? top + LINE_PX;
  return { top, height: Math.max(LINE_PX, bottom - top) };
}
