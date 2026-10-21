import type { RestoredSectionInput, StreamItem } from "./types";

const HEADING = /^(={1,6})(.+?)\1\s*$/;

export interface SectionSpan extends RestoredSectionInput {
  start: number;
  end: number;
  restored: boolean;
}

interface LineSpan {
  text: string;
  start: number;
}

interface RestoredHit {
  start: number;
  end: number;
  at: string | null;
}

export function describeSections(
  content: string,
  leading: string,
  items: readonly StreamItem[],
  timestamps: ReadonlyMap<number, string>,
): SectionSpan[] {
  const hits: RestoredHit[] = [];
  let walked = leading;
  for (const item of items) {
    const start = walked.length;
    walked += item.text;
    const end = walked.length;
    walked += item.gapAfter;
    if (item.restored && end > start) {
      hits.push({
        start,
        end,
        at: timestamps.get(item.origin) ?? null,
      });
    }
  }
  if (walked !== content) {
    throw new Error("section map drifted from rendered text");
  }
  return splitHeadings(content, hits);
}

function splitHeadings(
  content: string,
  hits: readonly RestoredHit[],
): SectionSpan[] {
  const lines = lineSpans(content);
  const headingIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (HEADING.test(line.text)) headingIndexes.push(index);
  });
  const ranges: Array<{ heading: string | null; start: number; end: number }> =
    [];
  if (headingIndexes.length === 0) {
    ranges.push({ heading: null, start: 0, end: content.length });
  } else {
    const first = headingIndexes[0]!;
    if (lines[first]!.start > 0) {
      ranges.push({ heading: null, start: 0, end: lines[first]!.start });
    }
    for (let i = 0; i < headingIndexes.length; i++) {
      const line = lines[headingIndexes[i]!]!;
      const next = headingIndexes[i + 1];
      const end = next === undefined ? content.length : lines[next]!.start;
      const match = HEADING.exec(line.text);
      ranges.push({
        heading: (match?.[2] ?? "").trim(),
        start: line.start,
        end,
      });
    }
  }
  return ranges.map((range) => {
    const overlapping = hits.filter(
      (hit) => hit.start < range.end && hit.end > range.start,
    );
    const times = overlapping
      .map((hit) => hit.at)
      .filter((at): at is string => at != null)
      .sort();
    return {
      heading: range.heading,
      text: content.slice(range.start, range.end),
      restoredAt: times[0] ?? null,
      start: range.start,
      end: range.end,
      restored: overlapping.length > 0,
    };
  });
}

function lineSpans(content: string): LineSpan[] {
  const lines: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) !== 10) continue;
    lines.push({ text: content.slice(start, i), start });
    start = i + 1;
  }
  lines.push({ text: content.slice(start), start });
  return lines;
}
