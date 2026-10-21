import type { Analysis } from "./provenance";
import { applySplices, renderText, type Splice } from "./render";
import { splitDocument } from "./split";
import type { Note, ResolvedOptions, StreamItem, Token } from "./types";

export interface DerivativeCtx {
  tainted: ReadonlySet<number>;
  options: ResolvedOptions;
  finalSentences: Token[][];
  droppedFinalIds: ReadonlySet<number>;
  paraphrase: Analysis["paraphrase"];
  leading: string;
}

export function passDerivative(
  items: StreamItem[],
  notes: Note[],
  ctx: DerivativeCtx,
): { items: StreamItem[]; notes: Note[]; leading: string } {
  const extra: Note[] = [];
  const splices: Splice[] = [];
  const claimed = new Set<number>();

  for (const sentence of ctx.finalSentences) {
    if (sentence.length === 0) continue;
    if (!sentence.some((token) => ctx.droppedFinalIds.has(token.id))) continue;
    const taintedCount = sentence.filter((token) =>
      ctx.tainted.has(token.origin),
    ).length;
    const ratio = taintedCount / sentence.length;
    const ids = new Set(sentence.map((token) => token.id));
    const positions = items.flatMap((item, index) =>
      ids.has(item.tokenId) ? [index] : [],
    );
    const newestTainted = sentence.reduce(
      (newest, token) =>
        ctx.tainted.has(token.origin) ? Math.max(newest, token.origin) : newest,
      0,
    );
    if (ratio >= ctx.options.derivativeDropThreshold) {
      const clean = positions.filter((index) => {
        const origin = items[index]!.origin;
        return (
          !ctx.tainted.has(origin) &&
          origin > newestTainted &&
          !claimed.has(index)
        );
      });
      if (clean.length === 0) continue;
      for (const index of clean) claimed.add(index);
      const revs = [
        ...new Set(clean.map((index) => items[index]!.origin)),
      ].sort((a, b) => a - b);
      extra.push({
        action: "drop-derivative",
        details: [`ratio:${formatRatio(ratio)}`, `revs:${revs.join(",")}`],
        start: clean[0]!,
        end: clean[0]!,
      });
      for (const [start, end] of groupRanges(clean))
        splices.push({ start, end, insert: [], notes: [] });
    } else if (
      ratio >= ctx.options.derivativeFlagThreshold &&
      positions.length > 0
    ) {
      extra.push({
        action: "flag-derivative",
        details: [`ratio:${formatRatio(ratio)}`],
        start: positions[0]!,
        end: positions[positions.length - 1]! + 1,
      });
    }
  }

  const dropped = applySplices(items, notes.concat(extra), splices);
  const flags = paraphraseFlags(ctx.leading, dropped.items, ctx.paraphrase);
  return {
    leading: ctx.leading,
    items: dropped.items,
    notes: dropped.notes.concat(flags),
  };
}

function paraphraseFlags(
  leading: string,
  items: StreamItem[],
  notes: Analysis["paraphrase"],
): Note[] {
  if (notes.length === 0 || items.length === 0) return [];
  const doc = splitDocument(renderText(leading, items));
  const flat = doc.paragraphs.flatMap((paragraph) => paragraph.sentences);
  const count = flat.reduce((sum, sentence) => sum + sentence.tokens.length, 0);
  if (count !== items.length) return [];
  const flags: Note[] = [];
  let cursor = 0;
  for (const sentence of flat) {
    const slice = items.slice(cursor, cursor + sentence.tokens.length);
    const start = cursor;
    cursor += sentence.tokens.length;
    const ids = new Set(slice.map((item) => item.tokenId));
    const hit = notes.some(
      (note) =>
        note.insertedIds.some((id) => ids.has(id)) &&
        note.removedTaintedIds.every((id) => !ids.has(id)),
    );
    if (!hit || slice.length === 0) continue;
    flags.push({ action: "flag-paraphrase", start, end: start + slice.length });
  }
  return flags;
}

function formatRatio(ratio: number): string {
  return (Math.round(ratio * 1000) / 1000).toString();
}

function groupRanges(indexes: number[]): Array<[number, number]> {
  const sorted = [...indexes].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let start = sorted[0]!;
  let prev = start;
  for (let i = 1; i < sorted.length; i++) {
    const index = sorted[i]!;
    if (index === prev + 1) prev = index;
    else {
      out.push([start, prev + 1]);
      start = index;
      prev = index;
    }
  }
  out.push([start, prev + 1]);
  return out;
}
