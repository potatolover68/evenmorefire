import { diffLines } from "diff";

export interface AlignedRow {
  before: string | null;
  after: string | null;
  /** 0-based line in the latest revision, when this row shows one. */
  beforeLine: number | null;
  /** 0-based line in the proposed text, when this row shows one. */
  afterLine: number | null;
}

export function alignSides(before: string, after: string): AlignedRow[] {
  const changes = diffLines(
    withTrailingNewline(before),
    withTrailingNewline(after),
  );
  const rows: AlignedRow[] = [];
  let beforeLine = 0;
  let afterLine = 0;
  for (const change of changes) {
    for (const line of linesOf(change.value)) {
      if (change.removed) {
        rows.push({ before: line, after: null, beforeLine, afterLine: null });
        beforeLine += 1;
      } else if (change.added) {
        rows.push({
          before: null,
          after: line,
          beforeLine: null,
          afterLine,
        });
        afterLine += 1;
      } else {
        rows.push({ before: line, after: line, beforeLine, afterLine });
        beforeLine += 1;
        afterLine += 1;
      }
    }
  }
  if (rows.length === 0) {
    rows.push({ before: "", after: "", beforeLine: 0, afterLine: 0 });
  }
  return rows;
}

export interface AfterLineIndex {
  first: number[];
  last: number[];
}

export function indexLines(
  rows: readonly AlignedRow[],
  key: "beforeLine" | "afterLine",
): AfterLineIndex {
  let max = -1;
  for (const row of rows) {
    const line = row[key];
    if (line != null && line > max) max = line;
  }
  const first = new Array<number>(max + 1).fill(-1);
  const last = new Array<number>(max + 1).fill(-1);
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]![key];
    if (line == null) continue;
    if (first[line] === -1) first[line] = i;
    last[line] = i;
  }
  return { first, last };
}

/** Map each proposal line to the aligned rows that show it. */
export function indexAfterLines(rows: readonly AlignedRow[]): AfterLineIndex {
  return indexLines(rows, "afterLine");
}

/** Inclusive line span in the proposal, mapped onto aligned rows. */
export function visualSpan(
  rows: readonly AlignedRow[],
  startLine: number,
  endLine: number,
): { from: number; to: number } {
  const fromLine = Math.max(0, Math.min(startLine, endLine));
  const toLine = Math.max(fromLine, Math.max(startLine, endLine));
  let from = -1;
  let to = -1;
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!.afterLine;
    if (line == null || line < fromLine || line > toLine) continue;
    if (from < 0) from = i;
    to = i;
  }
  if (from < 0) return { from: 0, to: 0 };
  return { from, to };
}

export function visualSpanIndexed(
  index: AfterLineIndex,
  startLine: number,
  endLine: number,
): { from: number; to: number } {
  if (index.first.length === 0) return { from: 0, to: 0 };
  const fromLine = Math.max(0, Math.min(startLine, endLine));
  const toLine = Math.min(
    index.first.length - 1,
    Math.max(fromLine, Math.max(startLine, endLine)),
  );
  let from = -1;
  let to = -1;
  for (let line = fromLine; line <= toLine; line++) {
    if (index.first[line] === -1) continue;
    if (from < 0) from = index.first[line]!;
    to = index.last[line]!;
  }
  if (from < 0) return { from: 0, to: 0 };
  return { from, to };
}

function linesOf(value: string): string[] {
  const parts = value.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function withTrailingNewline(text: string): string {
  if (text.length === 0 || text.endsWith("\n")) return text;
  return `${text}\n`;
}
