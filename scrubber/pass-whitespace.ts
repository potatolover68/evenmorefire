import type { Note, StreamItem } from "./types";
import { splitDocument } from "./split";

const CONJUNCTIONS = new Set(["and", "but", "or", "nor", "yet", "so", "for"]);
const RELATIVES = new Set(["which", "that", "who", "whom", "whose"]);

export function passWhitespace(
  leading: string,
  items: StreamItem[],
  notes: Note[],
  finalText: string,
  droppedFinalIds: ReadonlySet<number>,
  finalTokens: ReadonlyArray<{ id: number }>,
  avoidOrphans = false,
): { leading: string; items: StreamItem[]; notes: Note[] } {
  const next = items.map((item) => ({ ...item }));
  const protectedGap = protectedGaps(next);
  let nextLeading = leading;
  for (let i = 0; i < next.length; i++) {
    const item = next[i]!;
    const following = next[i + 1];
    if (following && !protectedGap[i] && /^[.,;:)]$/.test(following.text)) {
      item.gapAfter = item.gapAfter.replace(/ +$/g, "");
    }
  }
  const trailing = finalText.match(/\s*$/)?.[0] ?? "";
  if (next.length === 0) nextLeading = trailing;
  else next[next.length - 1]!.gapAfter = trailing;

  const flags = fragmentFlags(nextLeading, next, droppedFinalIds, finalTokens);
  if (!avoidOrphans) {
    return { leading: nextLeading, items: next, notes: notes.concat(flags) };
  }
  return dropFragments(nextLeading, next, notes, flags);
}

function protectedGaps(items: readonly StreamItem[]): boolean[] {
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
    if (text === "{{") template++;
    else if (text === "[[") link++;
    else if (text === "<!--") comment = true;
    else if (text === "{" && next === "|") stack.push("table");
    else if (text === "<" && next !== "/" && next !== "") {
      const opened = next.toLowerCase();
      if (opened === "nowiki" && !selfCloses(items, i)) nowiki = true;
      else if (opened === "ref" && !selfCloses(items, i)) ref++;
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

function fragmentFlags(
  leading: string,
  items: StreamItem[],
  droppedFinalIds: ReadonlySet<number>,
  finalTokens: ReadonlyArray<{ id: number }>,
): Note[] {
  const text = leading + items.map((item) => item.text + item.gapAfter).join("");
  const pieces: Array<{ start: number; end: number; item: number }> = [];
  let at = leading.length;
  items.forEach((item, index) => {
    const start = at;
    at += item.text.length;
    pieces.push({ start, end: at, item: index });
    at += item.gapAfter.length;
  });
  const doc = splitDocument(text);
  const notes: Note[] = [];
  for (const paragraph of doc.paragraphs) {
    if (!proseKey(paragraph.key)) continue;
    for (const sentence of paragraph.sentences) {
      if (sentence.tokens.length === 0) continue;
      const startChar = sentence.tokens[0]!.start;
      const endChar = sentence.tokens[sentence.tokens.length - 1]!.end;
      const indexes = pieces
        .filter((piece) => piece.end > startChar && piece.start < endChar)
        .map((piece) => piece.item);
      if (indexes.length === 0) continue;
      const start = indexes[0]!;
      const end = indexes[indexes.length - 1]! + 1;
      const slice = items.slice(start, end);
      if (
        slice.some(
          (item) =>
            item.text === "<" || item.text === "{{" || item.text === "[[",
        )
      ) {
        continue;
      }
      const restored = slice.some((item) => item.restored);
      const firstFinal = slice
        .map((item) => item.finalIndex)
        .find((index) => index !== null);
      const followsDrop =
        firstFinal !== undefined &&
        firstFinal !== null &&
        firstFinal > 0 &&
        droppedFinalIds.has(finalTokens[firstFinal - 1]!.id);
      if (!restored && !followsDrop) continue;
      const words = slice.filter((item) => /\p{L}/u.test(item.text));
      const firstWord = words[0]?.text ?? "";
      const surface = slice.map((item) => item.text).join("");
      const bare = surface.trim();
      const conjunction =
        CONJUNCTIONS.has(firstWord) &&
        firstWord[0] === firstWord[0]?.toLowerCase();
      const relative = RELATIVES.has(firstWord.toLowerCase());
      const comma = bare.startsWith(",") || slice[0]?.text === ",";
      const missing =
        bare.length > 0 && /\p{L}/u.test(bare) && !/[.!?]$/.test(bare);
      if (!conjunction && !missing && !relative && !comma) continue;
      notes.push({ action: "flag-fragment", start, end });
    }
  }
  return notes;
}

function proseKey(key: string): boolean {
  return !/^[{|=*#:!<]/.test(key);
}

function dropFragments(
  leading: string,
  items: StreamItem[],
  notes: Note[],
  flags: Note[],
): { leading: string; items: StreamItem[]; notes: Note[] } {
  if (flags.length === 0) return { leading, items, notes };
  const drop = new Array<boolean>(items.length).fill(false);
  for (const flag of flags) {
    for (let i = flag.start; i < flag.end && i < items.length; i++) drop[i] = true;
  }
  const map = new Array<number>(items.length);
  let kept = 0;
  for (let i = 0; i < items.length; i++) {
    map[i] = kept;
    if (!drop[i]) kept += 1;
  }
  const nextItems = items.filter((_, index) => !drop[index]);
  const point = (index: number) => map[index] ?? nextItems.length;
  const nextNotes = notes.flatMap((note) => {
    if (note.end <= note.start) {
      return [{ ...note, start: point(note.start), end: point(note.start) }];
    }
    let start = note.start;
    while (start < note.end && drop[start]) start += 1;
    let end = note.end;
    while (end > start && drop[end - 1]) end -= 1;
    if (start >= end) return [];
    return [{ ...note, start: point(start), end: point(end - 1) + 1 }];
  });
  for (const flag of flags) {
    const at = point(flag.start);
    nextNotes.push({ action: "remove-fragment", start: at, end: at });
  }
  return { leading, items: nextItems, notes: nextNotes };
}
