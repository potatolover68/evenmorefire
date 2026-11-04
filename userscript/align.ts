import { diffLines, diffWordsWithSpace, type Change } from "diff";

/** A slice of a line. `changed` is a word the other side does not have. */
export interface InlinePart {
  text: string;
  changed: boolean;
}

export interface AlignedRow {
  before: string | null;
  after: string | null;
  /** 0-based line in the latest revision, when this row shows one. */
  beforeLine: number | null;
  /** 0-based line in the proposed text, when this row shows one. */
  afterLine: number | null;
  /** Word-level pieces of `before`, when this row is an inline diff. */
  beforeParts?: InlinePart[];
  /** Word-level pieces of `after`, when this row is an inline diff. */
  afterParts?: InlinePart[];
}

const INLINE_LIMIT = 8000;
const DICE_THRESHOLD = 0.5;

export function alignSides(before: string, after: string): AlignedRow[] {
  const changes = diffLines(
    withTrailingNewline(before),
    withTrailingNewline(after),
  );
  const rows: AlignedRow[] = [];
  let beforeLine = 0;
  let afterLine = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (removed.length === 0 && added.length === 0) return;
    const paired =
      removed.length > 0 && added.length > 0
        ? inlineRows(removed, added, beforeLine, afterLine)
        : null;
    if (paired) {
      rows.push(...paired);
      beforeLine += removed.length;
      afterLine += added.length;
    } else {
      for (const line of removed) {
        rows.push({ before: line, after: null, beforeLine, afterLine: null });
        beforeLine += 1;
      }
      for (const line of added) {
        rows.push({
          before: null,
          after: line,
          beforeLine: null,
          afterLine,
        });
        afterLine += 1;
      }
    }
    removed = [];
    added = [];
  };
  for (const change of changes) {
    const lines = linesOf(change.value);
    if (change.removed) removed.push(...lines);
    else if (change.added) added.push(...lines);
    else {
      flush();
      for (const line of lines) {
        rows.push({ before: line, after: line, beforeLine, afterLine });
        beforeLine += 1;
        afterLine += 1;
      }
    }
  }
  flush();
  if (rows.length === 0) {
    rows.push({ before: "", after: "", beforeLine: 0, afterLine: 0 });
  }
  return rows;
}

function inlineRows(
  removed: readonly string[],
  added: readonly string[],
  beforeLine: number,
  afterLine: number,
): AlignedRow[] | null {
  const beforeText = removed.join("\n");
  const afterText = added.join("\n");
  if (beforeText.length > INLINE_LIMIT || afterText.length > INLINE_LIMIT) {
    return null;
  }
  if (dice(beforeText, afterText) < DICE_THRESHOLD) return null;
  const changes = diffWordsWithSpace(beforeText, afterText);
  const left = sideLines(changes, "before");
  const right = sideLines(changes, "after");
  if (left.map((line) => line.text).join("\n") !== beforeText) return null;
  if (right.map((line) => line.text).join("\n") !== afterText) return null;
  const count = Math.max(left.length, right.length);
  const rows: AlignedRow[] = [];
  for (let i = 0; i < count; i++) {
    const oldLine = left[i];
    const newLine = right[i];
    rows.push({
      before: oldLine ? oldLine.text : null,
      after: newLine ? newLine.text : null,
      beforeLine: oldLine ? beforeLine + i : null,
      afterLine: newLine ? afterLine + i : null,
      beforeParts: oldLine?.parts,
      afterParts: newLine?.parts,
    });
  }
  return rows;
}

function dice(left: string, right: string): number {
  const leftCounts = wordCounts(left);
  const rightCounts = wordCounts(right);
  let leftTotal = 0;
  let rightTotal = 0;
  let shared = 0;
  for (const count of leftCounts.values()) leftTotal += count;
  for (const count of rightCounts.values()) rightTotal += count;
  if (leftTotal + rightTotal === 0) return 1;
  for (const [word, count] of leftCounts) {
    shared += Math.min(count, rightCounts.get(word) ?? 0);
  }
  return (2 * shared) / (leftTotal + rightTotal);
}

function wordCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of text.split(/\s+/)) {
    if (word.length === 0) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

interface SideLine {
  text: string;
  parts: InlinePart[];
}

function sideLines(
  changes: readonly Change[],
  side: "before" | "after",
): SideLine[] {
  const lines: SideLine[] = [{ text: "", parts: [] }];
  for (const change of changes) {
    const include = side === "before" ? !change.added : !change.removed;
    if (!include) continue;
    const changed = side === "before" ? change.removed : change.added;
    const pieces = change.value.split("\n");
    for (let i = 0; i < pieces.length; i++) {
      if (i > 0) lines.push({ text: "", parts: [] });
      pushPart(lines[lines.length - 1]!, pieces[i]!, changed);
    }
  }
  return lines;
}

function pushPart(line: SideLine, text: string, changed: boolean): void {
  if (text.length === 0) return;
  line.text += text;
  const last = line.parts[line.parts.length - 1];
  if (last && last.changed === changed) last.text += text;
  else line.parts.push({ text, changed });
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
