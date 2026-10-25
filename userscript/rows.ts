import type { AlignedRow } from "./align.ts";

export const LINE_PX = 18;

export function charsAcross(widthPx: number, charPx: number): number {
  if (widthPx <= 0 || charPx <= 0) return 80;
  return Math.max(1, Math.floor(widthPx / charPx));
}

export function wrapCount(text: string | null, charsPerLine: number): number {
  if (text == null || text.length === 0) return 1;
  const width = Math.max(1, charsPerLine);
  return Math.max(1, Math.ceil(displayColumns(text) / width));
}

function displayColumns(text: string): number {
  let columns = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    columns += cp <= 0xff ? 1 : 2;
    i += cp > 0xffff ? 2 : 1;
  }
  return columns;
}

export function rowHeights(
  rows: readonly AlignedRow[],
  charsPerLine: number,
): number[] {
  return rows.map(
    (row) =>
      LINE_PX *
      Math.max(
        wrapCount(row.before, charsPerLine),
        wrapCount(row.after, charsPerLine),
      ),
  );
}

/** `prefix[i]` is the top of row `i`. `prefix[length]` is the total height. */
export function heightPrefix(heights: readonly number[]): number[] {
  const prefix = new Array<number>(heights.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < heights.length; i++) {
    prefix[i + 1] = prefix[i]! + heights[i]!;
  }
  return prefix;
}

export function rowAt(prefix: readonly number[], offset: number): number {
  const last = prefix.length - 2;
  if (last < 0) return 0;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefix[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
