import type { Explanation, Note, Pos, StreamItem } from "./types";

export interface Splice {
  start: number;
  end: number;
  insert: StreamItem[];
  /** Note ranges are relative to `insert` (or zero-width inside it). */
  notes: Note[];
}

export function renderText(
  leading: string,
  items: readonly StreamItem[],
): string {
  let out = leading;
  for (const item of items) out += item.text + item.gapAfter;
  return out;
}

export function applySplices(
  items: StreamItem[],
  notes: Note[],
  splices: readonly Splice[],
): { items: StreamItem[]; notes: Note[] } {
  const sorted = [...splices].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const indexMap: Array<number | null> = new Array(items.length).fill(null);
  const nextItems: StreamItem[] = [];
  const insertedNotes: Note[] = [];
  let cursor = 0;
  for (const splice of sorted) {
    const start = Math.max(splice.start, cursor);
    for (let i = cursor; i < start; i++) {
      indexMap[i] = nextItems.length;
      nextItems.push(items[i]!);
    }
    const at = nextItems.length;
    for (const note of splice.notes) {
      insertedNotes.push({
        ...note,
        details: note.details?.slice(),
        start: at + note.start,
        end: at + note.end,
      });
    }
    nextItems.push(...splice.insert);
    const end = Math.max(splice.end, start);
    for (let i = start; i < end && i < items.length; i++) indexMap[i] = null;
    cursor = Math.max(cursor, end);
  }
  for (let i = cursor; i < items.length; i++) {
    indexMap[i] = nextItems.length;
    nextItems.push(items[i]!);
  }
  const nextNotes = notes.map((note) =>
    remapNote(note, indexMap, nextItems.length),
  );
  return { items: nextItems, notes: nextNotes.concat(insertedNotes) };
}

function remapNote(
  note: Note,
  indexMap: Array<number | null>,
  length: number,
): Note {
  if (note.start === note.end) {
    if (note.start >= indexMap.length)
      return { ...note, start: length, end: length };
    const direct = indexMap[note.start];
    if (direct !== null && direct !== undefined)
      return { ...note, start: direct, end: direct };
    for (let i = note.start + 1; i < indexMap.length; i++) {
      const mapped = indexMap[i];
      if (mapped !== null && mapped !== undefined)
        return { ...note, start: mapped, end: mapped };
    }
    return { ...note, start: length, end: length };
  }
  let start: number | null = null;
  let end: number | null = null;
  for (let i = note.start; i < note.end && i < indexMap.length; i++) {
    const mapped = indexMap[i];
    if (mapped === null || mapped === undefined) continue;
    if (start === null) start = mapped;
    end = mapped + 1;
  }
  if (start === null || end === null) {
    const point = remapNote(
      { ...note, start: note.start, end: note.start },
      indexMap,
      length,
    );
    return point;
  }
  return { ...note, start, end };
}

export function renderStream(
  leading: string,
  items: readonly StreamItem[],
  notes: readonly Note[],
): { content: string; explanations: Explanation[] } {
  const starts: number[] = [];
  const ends: number[] = [];
  let content = leading;
  for (const item of items) {
    starts.push(content.length);
    content += item.text;
    ends.push(content.length);
    content += item.gapAfter;
  }
  const raw = notes.map((note) => {
    const latest = {
      latestStart: note.latestStart,
      latestEnd: note.latestEnd,
    };
    if (note.start === note.end) {
      const at =
        note.start < items.length ? starts[note.start]! : content.length;
      return {
        a: at,
        b: at,
        action: note.action,
        details: note.details,
        ...latest,
      };
    }
    const last = Math.min(note.end, items.length) - 1;
    const a = starts[note.start] ?? content.length;
    const b = last >= note.start ? ends[last]! : a;
    return { a, b, action: note.action, details: note.details, ...latest };
  });
  raw.sort(
    (x, y) => x.a - y.a || x.b - y.b || x.action.localeCompare(y.action),
  );
  const merged: typeof raw = [];
  for (const note of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.action === note.action &&
      sameDetails(prev.details, note.details) &&
      note.a <= prev.b
    ) {
      prev.b = Math.max(prev.b, note.b);
      const span = unionLatest(prev, note);
      prev.latestStart = span.latestStart;
      prev.latestEnd = span.latestEnd;
    } else {
      merged.push({ ...note, details: note.details?.slice() });
    }
  }
  const lineStarts = lineStartIndex(content);
  return {
    content,
    explanations: merged.map((note) => ({
      start: toPos(note.a, lineStarts),
      end: toPos(note.b, lineStarts),
      action: note.action,
      details: note.details,
      ...(note.latestStart && note.latestEnd
        ? { latestStart: note.latestStart, latestEnd: note.latestEnd }
        : {}),
    })),
  };
}

function unionLatest(
  prev: { latestStart?: Pos; latestEnd?: Pos },
  note: { latestStart?: Pos; latestEnd?: Pos },
): { latestStart?: Pos; latestEnd?: Pos } {
  if (!note.latestStart || !note.latestEnd) return prev;
  if (!prev.latestStart || !prev.latestEnd) {
    return { latestStart: note.latestStart, latestEnd: note.latestEnd };
  }
  return {
    latestStart: earlierPos(prev.latestStart, note.latestStart),
    latestEnd: laterPos(prev.latestEnd, note.latestEnd),
  };
}

function earlierPos(a: Pos, b: Pos): Pos {
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? a : b;
}

function laterPos(a: Pos, b: Pos): Pos {
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]) ? a : b;
}

export function lineStartIndex(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++)
    if (content.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function toPos(offset: number, lineStarts: readonly number[]): Pos {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo, offset - lineStarts[lo]!];
}

function sameDetails(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function sortExplanations(explanations: Explanation[]): Explanation[] {
  return [...explanations].sort(
    (a, b) =>
      a.start[0] - b.start[0] ||
      a.start[1] - b.start[1] ||
      a.end[0] - b.end[0] ||
      a.end[1] - b.end[1] ||
      a.action.localeCompare(b.action),
  );
}
