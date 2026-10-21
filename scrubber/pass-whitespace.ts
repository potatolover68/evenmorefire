import type { Note, StreamItem } from "./types";
import { splitDocument } from "./split";

const CONJUNCTIONS = new Set(["and", "but", "or", "nor", "yet", "so", "for"]);

export function passWhitespace(
  leading: string,
  items: StreamItem[],
  notes: Note[],
  finalText: string,
  droppedFinalIds: ReadonlySet<number>,
  finalTokens: ReadonlyArray<{ id: number }>,
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
  return { leading: nextLeading, items: next, notes: notes.concat(flags) };
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
  const doc = splitDocument(
    leading + items.map((item) => item.text + item.gapAfter).join(""),
  );
  const sentences = doc.paragraphs.flatMap((paragraph) =>
    paragraph.sentences.map((sentence) => ({
      sentence,
      prose: proseKey(paragraph.key),
    })),
  );
  const count = sentences.reduce(
    (sum, entry) => sum + entry.sentence.tokens.length,
    0,
  );
  if (count !== items.length) return [];
  const notes: Note[] = [];
  let cursor = 0;
  for (const entry of sentences) {
    const start = cursor;
    const slice = items.slice(cursor, cursor + entry.sentence.tokens.length);
    cursor += entry.sentence.tokens.length;
    if (!entry.prose || slice.length === 0) continue;
    if (
      slice.some(
        (item) => item.text === "<" || item.text === "{{" || item.text === "[[",
      )
    )
      continue;
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
    const conjunction =
      CONJUNCTIONS.has(firstWord) &&
      firstWord[0] === firstWord[0]?.toLowerCase();
    const bare = surface.trim();
    const missing =
      bare.length > 0 && /\p{L}/u.test(bare) && !/[.!?]$/.test(bare);
    if (!conjunction && !missing) continue;
    notes.push({ action: "flag-fragment", start, end: start + slice.length });
  }
  return notes;
}

function proseKey(key: string): boolean {
  return !/^[{|=*#:!<]/.test(key);
}
