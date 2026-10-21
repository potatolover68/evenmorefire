import type { Analysis } from "./provenance";
import { lineStartIndex, toPos } from "./render";
import { isPresent } from "./replay";
import type { Hunk, Note, Pos, StreamItem, Token } from "./types";

interface Cell {
  uid: number;
  tokenId: number;
  text: string;
  gapAfter: string;
  origin: number;
  finalIndex: number | null;
  restored: boolean;
  prev: Cell | null;
  next: Cell | null;
}

interface NoteDraft {
  action: string;
  details?: string[];
  startUid: number | null;
  endUid: number | null;
  atEnd: boolean;
  removedIds?: number[];
}

export interface Assembled {
  leadingGap: string;
  items: StreamItem[];
  notes: Note[];
  nextUid: number;
}

export function assemble(
  analysis: Analysis,
  tainted: ReadonlySet<number>,
  reverts: ReadonlySet<number>,
): Assembled {
  let uid = 1;
  const head = cell(0, -1, "", "", -1, null, false);
  const tail = cell(0, -2, "", "", -1, null, false);
  head.next = tail;
  tail.prev = head;
  const byToken = new Map<number, Cell>();
  const holeBefore = new Map<number, Cell>();
  const drafts: NoteDraft[] = [];
  const finalIndex = new Map<number, number>();
  analysis.finalTokens.forEach((token, index) =>
    finalIndex.set(token.id, index),
  );
  const finalIds = new Set(finalIndex.keys());

  let run: Token[] = [];
  const flush = (before: Cell) => {
    if (run.length === 0) return;
    const revs = new Set<number>();
    let chars = 0;
    for (let i = 0; i < run.length; i++) {
      const token = run[i]!;
      if (tainted.has(token.origin)) revs.add(token.origin);
      for (const event of token.events)
        if (tainted.has(event.rev)) revs.add(event.rev);
      chars += token.value.length;
      if (i + 1 < run.length)
        chars += analysis.finalGapAfter.get(token.id)?.length ?? 0;
      holeBefore.set(token.id, before);
    }
    drafts.push({
      action: "remove-tainted",
      details: [...revs]
        .sort((a, b) => a - b)
        .map((id) => `rev:${id}`)
        .concat(`chars:${chars}`),
      startUid: before === tail ? null : before.uid,
      endUid: null,
      atEnd: before === tail,
      removedIds: run.map((token) => token.id),
    });
    run = [];
  };

  for (const token of analysis.finalTokens) {
    if (!isPresent(token, tainted, reverts)) {
      run.push(token);
      continue;
    }
    const node = cell(
      uid++,
      token.id,
      token.value,
      analysis.finalGapAfter.get(token.id) ?? "",
      token.origin,
      finalIndex.get(token.id) ?? null,
      false,
    );
    flush(node);
    insertBefore(tail, [node], byToken);
  }
  flush(tail);

  let leadingGap = analysis.finalLeading;

  const insertWithSeam = (anchor: Cell, cells: Cell[], hunk: Hunk) => {
    const prev = anchor.prev;
    const between = !prev || prev === head ? leadingGap : prev.gapAfter;
    if (!prev || prev === head) {
      if (hunk.gapBefore) leadingGap = hunk.gapBefore;
    } else if (
      hunk.gapBefore &&
      (hunk.leftAnchorIds[0] === prev.tokenId || prev.gapAfter === "")
    ) {
      prev.gapAfter = hunk.gapBefore;
    }
    insertBefore(anchor, cells, byToken);
    const last = cells[cells.length - 1];
    if (last && last.gapAfter === "" && between.includes("\n"))
      last.gapAfter = between;
  };

  const makeCells = (hunk: Hunk, tokens: readonly Token[]): Cell[] => {
    const wanted = new Set(tokens.map((token) => token.id));
    const picked: Cell[] = [];
    hunk.deleted.forEach((token, index) => {
      if (!wanted.has(token.id)) return;
      picked.push(
        cell(
          uid++,
          token.id,
          token.value,
          hunk.deletedGapAfter[index] ?? "",
          token.origin,
          null,
          true,
        ),
      );
    });
    return picked;
  };

  const anchorDraft = (
    hunk: Hunk,
    action: string,
    details: string[],
  ): NoteDraft => {
    for (const id of hunk.leftAnchorIds) {
      const node = byToken.get(id);
      if (!node?.next || node.next === tail) {
        if (node)
          return { action, details, startUid: null, endUid: null, atEnd: true };
        continue;
      }
      return {
        action,
        details,
        startUid: node.next.uid,
        endUid: null,
        atEnd: false,
      };
    }
    for (const id of hunk.rightAnchorIds) {
      const node = byToken.get(id);
      if (node)
        return {
          action,
          details,
          startUid: node.uid,
          endUid: null,
          atEnd: false,
        };
    }
    const first = head.next;
    if (first && first !== tail)
      return {
        action,
        details,
        startUid: first.uid,
        endUid: null,
        atEnd: false,
      };
    return { action, details, startUid: null, endUid: null, atEnd: true };
  };

  for (const hunk of analysis.hunks) {
    const restoring = hunk.deleted.filter(
      (token) => isPresent(token, tainted, reverts) && !byToken.has(token.id),
    );
    if (restoring.length === 0) continue;
    if (disposition(hunk, finalIds, tainted) === "supersede") {
      const by = firstCleanRemoval(hunk, tainted);
      drafts.push(
        anchorDraft(hunk, "superseded", [
          `rev:${hunk.rev}`,
          ...(by === null ? [] : [`by:${by}`]),
        ]),
      );
      continue;
    }
    const cells = makeCells(hunk, restoring);
    if (cells.length === 0) continue;
    const placed = place(
      hunk,
      cells,
      finalIndex,
      byToken,
      holeBefore,
      tail,
      insertWithSeam,
    );
    if (!placed) {
      drafts.push(
        anchorDraft(hunk, "anchor-lost", [
          `rev:${hunk.rev}`,
          `text:${hunk.deletedText.slice(0, 80)}`,
        ]),
      );
      continue;
    }
    const origin = restoring[0]!.origin;
    drafts.push({
      action: "restore",
      details: [`rev:${hunk.rev}`, `origin:${origin}`],
      startUid: cells[0]!.uid,
      endUid: cells[cells.length - 1]!.uid,
      atEnd: false,
    });
  }

  const items: StreamItem[] = [];
  const uidIndex = new Map<number, number>();
  for (
    let node: Cell | null = head.next;
    node && node !== tail;
    node = node.next
  ) {
    uidIndex.set(node.uid, items.length);
    items.push({
      uid: node.uid,
      tokenId: node.tokenId,
      text: node.text,
      gapAfter: node.gapAfter,
      origin: node.origin,
      finalIndex: node.finalIndex,
      restored: node.restored,
    });
  }
  const located = locateFinalTokens(analysis);
  const notes: Note[] = drafts.map((draft) =>
    draftToNote(draft, uidIndex, items.length, located),
  );
  return { leadingGap, items, notes, nextUid: uid };
}

function disposition(
  hunk: Hunk,
  finalIds: ReadonlySet<number>,
  tainted: ReadonlySet<number>,
): "restore" | "supersede" {
  if (hunk.inserted.length === 0) return "restore";
  if (hunk.inserted.some((token) => finalIds.has(token.id))) return "restore";
  const allClean = hunk.inserted.every((token) => {
    const last = token.events[token.events.length - 1];
    return last?.kind === "out" && !tainted.has(last.rev);
  });
  return allClean ? "supersede" : "restore";
}

function firstCleanRemoval(
  hunk: Hunk,
  tainted: ReadonlySet<number>,
): number | null {
  let by: number | null = null;
  for (const token of hunk.inserted) {
    for (const event of token.events) {
      if (
        event.kind === "out" &&
        !tainted.has(event.rev) &&
        (by === null || event.rev < by)
      )
        by = event.rev;
    }
  }
  return by;
}

function place(
  hunk: Hunk,
  cells: Cell[],
  finalIndex: Map<number, number>,
  byToken: Map<number, Cell>,
  holeBefore: Map<number, Cell>,
  tail: Cell,
  insertWithSeam: (anchor: Cell, cells: Cell[], hunk: Hunk) => void,
): boolean {
  const inFinal = hunk.inserted
    .filter((token) => finalIndex.has(token.id))
    .sort((a, b) => finalIndex.get(a.id)! - finalIndex.get(b.id)!);
  if (inFinal.length > 0) {
    const anchor =
      byToken.get(inFinal[0]!.id) ?? holeBefore.get(inFinal[0]!.id);
    if (anchor) {
      insertWithSeam(anchor, cells, hunk);
      return true;
    }
  }
  for (const id of hunk.leftAnchorIds) {
    const node = byToken.get(id);
    if (!node) continue;
    let cursor = node;
    while (cursor.next && cursor.next !== tail && cursor.next.restored)
      cursor = cursor.next;
    insertWithSeam(cursor.next ?? tail, cells, hunk);
    return true;
  }
  for (const id of hunk.rightAnchorIds) {
    const node = byToken.get(id);
    if (!node) continue;
    insertWithSeam(node, cells, hunk);
    return true;
  }
  return false;
}

function insertBefore(anchor: Cell, cells: Cell[], byToken: Map<number, Cell>) {
  let prev = anchor.prev!;
  for (const node of cells) {
    prev.next = node;
    node.prev = prev;
    prev = node;
    byToken.set(node.tokenId, node);
  }
  prev.next = anchor;
  anchor.prev = prev;
}

function draftToNote(
  draft: NoteDraft,
  uidIndex: Map<number, number>,
  length: number,
  located: FinalLocations,
): Note {
  const latest = latestSpan(draft.removedIds, located);
  if (draft.atEnd || draft.startUid === null) {
    return {
      action: draft.action,
      details: draft.details,
      start: length,
      end: length,
      ...latest,
    };
  }
  const start = uidIndex.get(draft.startUid);
  if (start === undefined) {
    return {
      action: draft.action,
      details: draft.details,
      start: 0,
      end: 0,
      ...latest,
    };
  }
  if (draft.endUid === null) {
    return {
      action: draft.action,
      details: draft.details,
      start,
      end: start,
      ...latest,
    };
  }
  const end = uidIndex.get(draft.endUid);
  if (end === undefined) {
    return {
      action: draft.action,
      details: draft.details,
      start,
      end: start,
      ...latest,
    };
  }
  return {
    action: draft.action,
    details: draft.details,
    start,
    end: end + 1,
    ...latest,
  };
}

interface FinalLocations {
  offsets: Map<number, { start: number; end: number }>;
  lineStarts: number[];
}

function locateFinalTokens(analysis: Analysis): FinalLocations {
  const offsets = new Map<number, { start: number; end: number }>();
  let cursor = analysis.finalLeading.length;
  for (const token of analysis.finalTokens) {
    const start = cursor;
    cursor += token.value.length;
    offsets.set(token.id, { start, end: cursor });
    cursor += analysis.finalGapAfter.get(token.id)?.length ?? 0;
  }
  return { offsets, lineStarts: lineStartIndex(analysis.finalText) };
}

function latestSpan(
  ids: readonly number[] | undefined,
  located: FinalLocations,
): { latestStart?: Pos; latestEnd?: Pos } {
  if (!ids || ids.length === 0) return {};
  let start = Number.POSITIVE_INFINITY;
  let end = -1;
  for (const id of ids) {
    const span = located.offsets.get(id);
    if (!span) continue;
    start = Math.min(start, span.start);
    end = Math.max(end, span.end);
  }
  if (end < 0 || !Number.isFinite(start)) return {};
  return {
    latestStart: toPos(start, located.lineStarts),
    latestEnd: toPos(end, located.lineStarts),
  };
}

function cell(
  uid: number,
  tokenId: number,
  text: string,
  gapAfter: string,
  origin: number,
  finalIndex: number | null,
  restored: boolean,
): Cell {
  return {
    uid,
    tokenId,
    text,
    gapAfter,
    origin,
    finalIndex,
    restored,
    prev: null,
    next: null,
  };
}
