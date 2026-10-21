import { applySplices, type Splice } from "./render";
import type { Note, StreamItem } from "./types";

const HEADING = /^(={1,6})(.+?)\1\s*$/;

export function passSections(
  items: StreamItem[],
  notes: Note[],
  tainted: ReadonlySet<number>,
): { items: StreamItem[]; notes: Note[] } {
  const located = locateLines(items);
  const headings: Array<{
    line: number;
    level: number;
    text: string;
    indexes: number[];
  }> = [];
  located.lines.forEach((line, index) => {
    const match = HEADING.exec(line.text);
    if (!match) return;
    headings.push({
      line: index,
      level: match[1]!.length,
      text: match[2]!.trim(),
      indexes: line.indexes,
    });
  });

  const splices: Splice[] = [];
  const flags: Note[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    let nextLine = located.lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j]!.level <= heading.level) {
        nextLine = headings[j]!.line;
        break;
      }
    }
    const between = located.lines
      .slice(heading.line + 1, nextLine)
      .map((line) => line.text)
      .join("\n");
    const bare = between.replace(/<!--[\s\S]*?-->/g, "");
    if (bare.trim() !== "") continue;
    const wordIndexes = heading.indexes.filter((index) =>
      /\p{L}|\p{N}/u.test(items[index]!.text),
    );
    const taintedHeading =
      (wordIndexes.length > 0 &&
        wordIndexes.every((index) => tainted.has(items[index]!.origin))) ||
      (heading.indexes.length > 0 &&
        heading.indexes.every((index) => tainted.has(items[index]!.origin)));
    if (taintedHeading && heading.indexes.length > 0) {
      const start = Math.min(...heading.indexes);
      const end = Math.max(...heading.indexes) + 1;
      splices.push({
        start,
        end,
        insert: [],
        notes: [
          {
            action: "remove-empty-section",
            details: [`heading:${heading.text}`],
            start: 0,
            end: 0,
          },
        ],
      });
    } else if (heading.indexes.length > 0) {
      flags.push({
        action: "flag-empty-section",
        details: [`heading:${heading.text}`],
        start: Math.min(...heading.indexes),
        end: Math.max(...heading.indexes) + 1,
      });
    }
  }
  const next = applySplices(items, notes, splices);
  return { items: next.items, notes: next.notes.concat(flags) };
}

function locateLines(items: readonly StreamItem[]): {
  lines: Array<{ text: string; indexes: number[] }>;
} {
  const lines: Array<{ text: string; indexes: number[] }> = [
    { text: "", indexes: [] },
  ];
  const pushGap = (gap: string) => {
    const parts = gap.split("\n");
    lines[lines.length - 1]!.text += parts[0] ?? "";
    for (let i = 1; i < parts.length; i++)
      lines.push({ text: parts[i] ?? "", indexes: [] });
  };
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    lines[lines.length - 1]!.indexes.push(index);
    lines[lines.length - 1]!.text += item.text;
    pushGap(item.gapAfter);
  }
  return { lines };
}
