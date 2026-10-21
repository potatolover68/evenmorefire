import type { Analysis } from "./provenance";
import { applySplices, type Splice } from "./render";
import { scanTokens } from "./wikiscan";
import type { Note, StreamItem, Token } from "./types";

export function passMarkup(
  items: StreamItem[],
  notes: Note[],
  analysis: Analysis,
): { items: StreamItem[]; notes: Note[] } {
  const closerOf = new Map<number, number>();
  const openerOf = new Map<number, number>();
  const tablePairs: Array<{ openerId: number; closerId: number }> = [];
  const addSeq = (tokens: readonly Token[]) => {
    const scan = scanTokens(
      tokens.map((token) => ({
        id: token.id,
        text: token.value,
        gapAfter: "",
      })),
    );
    for (const pair of scan.pairs) {
      if (pair.kind === "table") tablePairs.push(pair);
      if (closerOf.has(pair.openerId)) continue;
      closerOf.set(pair.openerId, pair.closerId);
      openerOf.set(pair.closerId, pair.openerId);
    }
  };
  addSeq(analysis.finalTokens);
  for (const source of analysis.sources) addSeq(source.tokens);

  const present = new Set(items.map((item) => item.tokenId));
  const finalIndex = new Map(
    analysis.finalTokens.map((token, index) => [token.id, index]),
  );
  const drop = new Set<number>();
  const repair: Note[] = [];

  for (const pair of tablePairs) {
    if (present.has(pair.openerId) && present.has(pair.closerId)) continue;
    const openerAt = finalIndex.get(pair.openerId);
    const closerAt = finalIndex.get(pair.closerId);
    if (openerAt === undefined || closerAt === undefined) continue;
    const lo = Math.min(openerAt, closerAt);
    const hi = Math.max(openerAt, closerAt);
    for (let i = 0; i < items.length; i++) {
      const at = items[i]!.finalIndex;
      if (at !== null && at >= lo && at <= hi) drop.add(i);
    }
    repair.push({
      action: "markup-repair",
      details: ["table"],
      start: 0,
      end: 0,
    });
  }

  for (let i = 0; i < items.length; i++) {
    const id = items[i]!.tokenId;
    const closer = closerOf.get(id);
    if (closer !== undefined && !present.has(closer)) {
      const closerAt = finalIndex.get(closer);
      let end = i + 1;
      if (closerAt !== undefined) {
        while (end < items.length) {
          const at = items[end]!.finalIndex;
          if (at !== null && at > closerAt) break;
          end++;
        }
      }
      for (let k = i; k < end; k++) drop.add(k);
      repair.push({
        action: "markup-repair",
        details: [`rev:${items[i]!.origin}`],
        start: i,
        end: i,
      });
    }
    const opener = openerOf.get(id);
    if (opener !== undefined && !present.has(opener) && !drop.has(i)) {
      drop.add(i);
      repair.push({
        action: "markup-repair",
        details: [`rev:${items[i]!.origin}`],
        start: i,
        end: i,
      });
    }
  }

  const splices: Splice[] = groupRanges([...drop]).map(([start, end]) => ({
    start,
    end,
    insert: [],
    notes: [],
  }));
  const next = applySplices(items, notes.concat(repair), splices);
  const still = new Set(next.items.map((item) => item.tokenId));
  const flags: Note[] = [];
  for (let i = 0; i < next.items.length; i++) {
    const id = next.items[i]!.tokenId;
    const closer = closerOf.get(id);
    const opener = openerOf.get(id);
    if (
      (closer !== undefined && !still.has(closer)) ||
      (opener !== undefined && !still.has(opener))
    ) {
      flags.push({ action: "flag-unbalanced", start: i, end: i + 1 });
    }
  }
  return { items: next.items, notes: next.notes.concat(flags) };
}

function groupRanges(indexes: number[]): Array<[number, number]> {
  if (indexes.length === 0) return [];
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
