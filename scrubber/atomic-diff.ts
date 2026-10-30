import { myersDiff, type Edit } from "./myers";
import { outermostAtomic, type ScanToken } from "./wikiscan";
import { MYERS_TOKEN_CAP, SENTENCE_REUSE_THRESHOLD } from "./types";

export interface TextToken {
  value: string;
  gapAfter: string;
  /** The token's source range sits in a non-prose span. */
  structural?: boolean;
  /** The token's source range sits inside `{{...}}`. */
  inTemplate?: boolean;
}

export interface SentenceAlignment {
  pairs: Array<{ prev: number; curr: number }>;
  deleted: number[];
  inserted: number[];
}

interface Piece {
  start: number;
  end: number;
  key: string;
}

/** Diff two token sequences, treating markup constructs as single symbols. */
export function atomicEdits(
  before: readonly TextToken[],
  after: readonly TextToken[],
): Edit[] {
  if (before.length > MYERS_TOKEN_CAP || after.length > MYERS_TOKEN_CAP) {
    return [
      { type: "delete", aStart: 0, aEnd: before.length, bStart: 0, bEnd: 0 },
      {
        type: "insert",
        aStart: before.length,
        aEnd: before.length,
        bStart: 0,
        bEnd: after.length,
      },
    ];
  }
  const a = piecesOf(before);
  const b = piecesOf(after);
  return expand(
    myersDiff(
      a.map((piece) => piece.key),
      b.map((piece) => piece.key),
    ),
    a,
    b,
    before.length,
    after.length,
  );
}

/** Equality keys used to decide whether two sentences are the same edit. */
export function symbolKeys(tokens: readonly TextToken[]): string[] {
  return piecesOf(tokens).map((piece) => piece.key);
}

/**
 * Pair sentences in document order. A pair is woven only when its symmetric
 * LCS ratio reaches {@link SENTENCE_REUSE_THRESHOLD}; otherwise the old
 * sentence is deleted and the new one is inserted whole.
 */
export function alignSentences(
  prev: readonly (readonly string[])[],
  curr: readonly (readonly string[])[],
  threshold = SENTENCE_REUSE_THRESHOLD,
): SentenceAlignment {
  const n = prev.length;
  const m = curr.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(Number.POSITIVE_INFINITY),
  );
  const choice: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  const ratios = new Map<number, number>();
  const ratioAt = (i: number, j: number): number => {
    const key = i * m + j;
    const hit = ratios.get(key);
    if (hit !== undefined) return hit;
    const ratio = lcsRatio(prev[i]!, curr[j]!, threshold);
    ratios.set(key, ratio);
    return ratio;
  };
  dp[0]![0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const base = dp[i]![j]!;
      if (!Number.isFinite(base)) continue;
      if (i < n && base + 1 < dp[i + 1]![j]!) {
        dp[i + 1]![j] = base + 1;
        choice[i + 1]![j] = 1;
      }
      if (j < m && base + 1 < dp[i]![j + 1]!) {
        dp[i]![j + 1] = base + 1;
        choice[i]![j + 1] = 2;
      }
      if (i < n && j < m) {
        const ratio = ratioAt(i, j);
        const cost = base + (1 - ratio);
        if (ratio >= threshold && cost < dp[i + 1]![j + 1]!) {
          dp[i + 1]![j + 1] = cost;
          choice[i + 1]![j + 1] = 3;
        }
      }
    }
  }

  const pairs: Array<{ prev: number; curr: number }> = [];
  const deleted: number[] = [];
  const inserted: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = choice[i]![j]!;
    if (step === 3) {
      pairs.push({ prev: i - 1, curr: j - 1 });
      i--;
      j--;
    } else if (step === 1) {
      deleted.push(i - 1);
      i--;
    } else if (step === 2) {
      inserted.push(j - 1);
      j--;
    } else {
      throw new Error("sentence alignment did not reach the origin");
    }
  }
  pairs.reverse();
  deleted.reverse();
  inserted.reverse();
  return { pairs, deleted, inserted };
}

function lcsRatio(
  a: readonly string[],
  b: readonly string[],
  threshold: number,
): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  if (a.length === b.length) {
    let same = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        same = false;
        break;
      }
    }
    if (same) return 1;
  }
  const bag = bagRatio(a, b, threshold);
  if (bag < threshold) return bag;
  let equal = 0;
  for (const edit of myersDiff(a, b)) {
    if (edit.type === "equal") equal += edit.aEnd - edit.aStart;
  }
  return (2 * equal) / total;
}

function bagRatio(
  a: readonly string[],
  b: readonly string[],
  threshold: number,
): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  if ((2 * Math.min(a.length, b.length)) / total < threshold) {
    return 0;
  }
  const freq = new Map<string, number>();
  for (const key of a) freq.set(key, (freq.get(key) ?? 0) + 1);
  let shared = 0;
  for (const key of b) {
    const count = freq.get(key) ?? 0;
    if (count <= 0) continue;
    shared++;
    freq.set(key, count - 1);
  }
  return (2 * shared) / total;
}

function piecesOf(tokens: readonly TextToken[]): Piece[] {
  const scan: ScanToken[] = tokens.map((token, id) => ({
    id,
    text: token.value,
    gapAfter: token.gapAfter,
  }));
  const atomic = outermostAtomic(scan);
  const spans = atomic.concat(headingSpans(tokens, atomic));
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const pieces: Piece[] = [];
  let index = 0;
  for (const span of spans) {
    if (span.start < index) continue;
    while (index < span.start) {
      pieces.push({
        start: index,
        end: index + 1,
        key: tokenKey(tokens[index]!),
      });
      index++;
    }
    pieces.push({
      start: span.start,
      end: span.end,
      key: spanKey(tokens, span.start, span.end),
    });
    index = span.end;
  }
  while (index < tokens.length) {
    pieces.push({
      start: index,
      end: index + 1,
      key: tokenKey(tokens[index]!),
    });
    index++;
  }
  return pieces;
}

function headingSpans(
  tokens: readonly TextToken[],
  occupied: readonly { start: number; end: number }[],
): Array<{ start: number; end: number }> {
  const covered = new Array<boolean>(tokens.length).fill(false);
  for (const span of occupied) {
    for (let i = span.start; i < span.end && i < covered.length; i++)
      covered[i] = true;
  }
  const spans: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (covered[i]) continue;
    const end = headingEnd(tokens, i);
    if (end <= i) continue;
    spans.push({ start: i, end });
    i = end - 1;
  }
  return spans;
}

function headingEnd(tokens: readonly TextToken[], start: number): number {
  const level = equalsRun(tokens, start);
  if (level < 2) return -1;
  let i = start + level;
  while (i < tokens.length) {
    if (tokens[i]!.gapAfter.includes("\n") && tokens[i]!.value !== "=")
      return -1;
    const run = equalsRun(tokens, i);
    if (run === level) {
      const end = i + run;
      const tail = tokens[end - 1]!.gapAfter;
      if (end === tokens.length || tail.includes("\n")) return end;
      return -1;
    }
    if (run > 0) return -1;
    i++;
  }
  return -1;
}

function equalsRun(tokens: readonly TextToken[], start: number): number {
  if (tokens[start]?.value !== "=") return 0;
  let count = 1;
  for (let i = start + 1; i < tokens.length; i++) {
    if (tokens[i]!.value !== "=" || tokens[i - 1]!.gapAfter !== "") break;
    count++;
  }
  return count;
}

function tokenKey(token: TextToken): string {
  return `t:${token.value}`;
}

function spanKey(
  tokens: readonly TextToken[],
  start: number,
  end: number,
): string {
  let text = "c:";
  for (let i = start; i < end; i++) {
    text += tokens[i]!.value;
    if (i + 1 < end) text += tokens[i]!.gapAfter;
  }
  return text;
}

function expand(
  edits: readonly Edit[],
  a: readonly Piece[],
  b: readonly Piece[],
  aLength: number,
  bLength: number,
): Edit[] {
  const out: Edit[] = [];
  const push = (edit: Edit) => {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === edit.type &&
      prev.aEnd === edit.aStart &&
      prev.bEnd === edit.bStart
    ) {
      prev.aEnd = edit.aEnd;
      prev.bEnd = edit.bEnd;
      return;
    }
    out.push(edit);
  };
  const aAt = (pieceIndex: number) =>
    pieceIndex < a.length ? a[pieceIndex]!.start : aLength;
  const bAt = (pieceIndex: number) =>
    pieceIndex < b.length ? b[pieceIndex]!.start : bLength;
  for (const edit of edits) {
    if (edit.type === "equal") {
      for (let piece = edit.aStart; piece < edit.aEnd; piece++) {
        const left = a[piece]!;
        const right = b[edit.bStart + (piece - edit.aStart)]!;
        if (left.end - left.start === right.end - right.start) {
          push({
            type: "equal",
            aStart: left.start,
            aEnd: left.end,
            bStart: right.start,
            bEnd: right.end,
          });
        } else {
          push({
            type: "delete",
            aStart: left.start,
            aEnd: left.end,
            bStart: right.start,
            bEnd: right.start,
          });
          push({
            type: "insert",
            aStart: left.end,
            aEnd: left.end,
            bStart: right.start,
            bEnd: right.end,
          });
        }
      }
    } else if (edit.type === "delete") {
      if (edit.aStart === edit.aEnd) continue;
      push({
        type: "delete",
        aStart: a[edit.aStart]!.start,
        aEnd: a[edit.aEnd - 1]!.end,
        bStart: bAt(edit.bStart),
        bEnd: bAt(edit.bEnd),
      });
    } else if (edit.bStart !== edit.bEnd) {
      push({
        type: "insert",
        aStart: aAt(edit.aStart),
        aEnd: aAt(edit.aEnd),
        bStart: b[edit.bStart]!.start,
        bEnd: b[edit.bEnd - 1]!.end,
      });
    }
  }
  return out;
}
