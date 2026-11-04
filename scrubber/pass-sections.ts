import { applySplices, type Splice } from "./render";
import type { Note, StreamItem } from "./types";

const HEADING = /^(={1,6})(.+?)\1\s*$/;

export function passSections(
  leading: string,
  items: StreamItem[],
  notes: Note[],
  tainted: ReadonlySet<number>,
): { leading: string; items: StreamItem[]; notes: Note[] } {
  const broken = ensureHeadingBreaks(leading, items);
  const located = locateLines(broken.items);
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
      /\p{L}|\p{N}/u.test(broken.items[index]!.text),
    );
    const taintedHeading =
      (wordIndexes.length > 0 &&
        wordIndexes.every((index) =>
          tainted.has(broken.items[index]!.origin),
        )) ||
      (heading.indexes.length > 0 &&
        heading.indexes.every((index) =>
          tainted.has(broken.items[index]!.origin),
        ));
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
  const next = applySplices(broken.items, notes, splices);
  return {
    leading: broken.leading,
    items: next.items,
    notes: next.notes.concat(flags),
  };
}

/** Put a wiki heading on its own line when a scrub left it stuck to the previous token. */
function ensureHeadingBreaks(
  leading: string,
  items: readonly StreamItem[],
): { leading: string; items: StreamItem[] } {
  const next = items.map((item) => ({ ...item }));
  let nextLeading = leading;
  const inside = protectedItems(next);
  for (let i = 0; i < next.length; i++) {
    if (inside[i]) continue;
    const end = headingEnd(next, i);
    if (end <= i) continue;
    if (!atLineStart(nextLeading, next, i)) {
      if (i === 0) {
        if (!nextLeading.endsWith("\n")) nextLeading += "\n";
      } else {
        const prev = next[i - 1]!;
        if (!prev.gapAfter.includes("\n")) prev.gapAfter += "\n";
      }
    }
    const last = next[end - 1]!;
    if (end < next.length && !last.gapAfter.includes("\n")) {
      last.gapAfter += "\n";
    }
    i = end - 1;
  }
  return { leading: nextLeading, items: next };
}

function atLineStart(
  leading: string,
  items: readonly StreamItem[],
  index: number,
): boolean {
  const before = index === 0 ? leading : items[index - 1]!.gapAfter;
  const nl = before.lastIndexOf("\n");
  if (nl < 0) return before.length === 0 && index === 0;
  return before.slice(nl + 1) === "";
}

function headingEnd(items: readonly StreamItem[], start: number): number {
  const level = equalsRun(items, start);
  if (level < 2) return -1;
  let i = start + level;
  while (i < items.length) {
    if (items[i]!.gapAfter.includes("\n") && items[i]!.text !== "=")
      return -1;
    const run = equalsRun(items, i);
    if (run === level) return i + run;
    if (run > 0) return -1;
    i += 1;
  }
  return -1;
}

function equalsRun(items: readonly StreamItem[], start: number): number {
  if (items[start]?.text !== "=") return 0;
  let count = 1;
  for (let i = start + 1; i < items.length; i++) {
    if (items[i]!.text !== "=" || items[i - 1]!.gapAfter !== "") break;
    count += 1;
  }
  return count;
}

function protectedItems(items: readonly StreamItem[]): boolean[] {
  const stack: string[] = [];
  let template = 0;
  let link = 0;
  let ref = 0;
  let comment = false;
  let nowiki = false;
  const inside = () =>
    stack.length > 0 ||
    template > 0 ||
    link > 0 ||
    ref > 0 ||
    comment ||
    nowiki;
  const flags: boolean[] = [];
  for (let i = 0; i < items.length; i++) {
    const text = items[i]!.text;
    const next = items[i + 1]?.text ?? "";
    const name = (items[i + 2]?.text ?? "").toLowerCase();
    if (text === "<" && next === "/") {
      if (name === "nowiki") nowiki = false;
      else if (name === "ref") ref = Math.max(0, ref - 1);
      else {
        const at = stack.lastIndexOf(name);
        if (at >= 0) stack.splice(at, 1);
      }
    } else if (text === "|" && next === "}") {
      const at = stack.lastIndexOf("table");
      if (at >= 0) stack.splice(at, 1);
    } else if (text === "}}") template = Math.max(0, template - 1);
    else if (text === "]]") link = Math.max(0, link - 1);
    else if (text === "-->") comment = false;
    flags.push(inside());
    if (text === "{{") template += 1;
    else if (text === "[[") link += 1;
    else if (text === "<!--") comment = true;
    else if (text === "{" && next === "|") stack.push("table");
    else if (text === "<" && next !== "/" && next !== "") {
      const opened = next.toLowerCase();
      if (opened === "nowiki" && !selfCloses(items, i)) nowiki = true;
      else if (opened === "ref" && !selfCloses(items, i)) ref += 1;
      else if (
        opened === "pre" ||
        opened === "syntaxhighlight" ||
        opened === "math"
      ) {
        if (!selfCloses(items, i)) stack.push(opened);
      }
    }
  }
  return flags;
}

function selfCloses(items: readonly StreamItem[], from: number): boolean {
  const end = Math.min(items.length, from + 12);
  for (let i = from; i < end; i++) {
    if (items[i]!.text === ">") return items[i - 1]?.text === "/";
  }
  return false;
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
