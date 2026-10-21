import { sortExplanations } from "./render";
import type { SectionSpan } from "./sections";
import type {
  Explanation,
  OnRestoredSection,
  Pos,
  SectionComment,
} from "./types";

export async function applyRestoredSections(
  content: string,
  explanations: Explanation[],
  sections: readonly SectionSpan[],
  callback: OnRestoredSection,
): Promise<{ content: string; explanations: Explanation[] }> {
  let next = content;
  let notes: Explanation[] = explanations.map((note) => ({
    ...note,
    details: note.details?.slice(),
  }));
  const restored = sections.filter((section) => section.restored);
  for (let index = restored.length - 1; index >= 0; index--) {
    const section = restored[index]!;
    const edited = await callback({
      heading: section.heading,
      text: section.text,
      restoredAt: section.restoredAt,
    });
    const replacement = edited.text;
    if (replacement === section.text && edited.comments.length === 0) continue;
    const startLine = lineOf(section.start, next);
    const oldLines = visualLines(section.text);
    const newLines = visualLines(replacement);
    next = next.slice(0, section.start) + replacement + next.slice(section.end);
    if (replacement !== section.text) {
      notes = notes.map((note) =>
        remapNote(note, next, startLine, oldLines, newLines),
      );
    }
    const added = edited.comments.map((comment) =>
      commentToExplanation(comment, startLine, next),
    );
    notes.push(...added);
  }
  return { content: next, explanations: sortExplanations(notes) };
}

function remapNote(
  note: Explanation,
  content: string,
  sectionStartLine: number,
  oldLines: readonly string[],
  newLines: readonly string[],
): Explanation {
  const mappedStart = mapLine(
    note.start[0],
    sectionStartLine,
    oldLines,
    newLines,
  );
  const mappedEnd = mapLine(note.end[0], sectionStartLine, oldLines, newLines);
  return {
    ...note,
    start: clamp(mappedStart, note.start[1], content),
    end: clamp(mappedEnd, note.end[1], content),
  };
}

function mapLine(
  line: number,
  sectionStartLine: number,
  oldLines: readonly string[],
  newLines: readonly string[],
): number {
  const oldLen = oldLines.length;
  const sectionEnd = sectionStartLine + oldLen;
  if (line < sectionStartLine) return line;
  if (line >= sectionEnd) return line + (newLines.length - oldLen);
  const relative = line - sectionStartLine;
  let prefix = 0;
  while (
    prefix < oldLen &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLen - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLen - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (relative < prefix) return sectionStartLine + relative;
  if (suffix > 0 && relative >= oldLen - suffix) {
    return sectionStartLine + newLines.length - (oldLen - relative);
  }
  return sectionStartLine + Math.min(prefix, Math.max(newLines.length - 1, 0));
}

function commentToExplanation(
  comment: SectionComment,
  sectionStartLine: number,
  content: string,
): Explanation {
  return {
    action: "deprecated-param",
    details: [comment.text],
    start: clamp(
      sectionStartLine + comment.startLine - 1,
      comment.startCh,
      content,
    ),
    end: clamp(sectionStartLine + comment.endLine - 1, comment.endCh, content),
  };
}

function visualLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function lineOf(offset: number, content: string): number {
  let line = 0;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function clamp(line: number, ch: number, content: string): Pos {
  const lines = content.split("\n");
  const last = Math.max(lines.length - 1, 0);
  const safeLine = Math.max(0, Math.min(line, last));
  const safeCh = Math.max(0, Math.min(ch, lines[safeLine]!.length));
  return [safeLine, safeCh];
}
