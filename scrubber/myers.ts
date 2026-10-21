export interface Edit {
  type: "equal" | "delete" | "insert";
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

interface Comp {
  count: number;
  added: boolean;
  removed: boolean;
  prev: Comp | null;
}

interface PathNode {
  oldPos: number;
  last: Comp | null;
}

/**
 * Myers diff over arrays compared with `===`.
 * Returns coalesced equal / delete / insert runs. A delete has an empty b-range;
 * an insert has an empty a-range. Prefix and suffix matches are peeled off first.
 */
export function myersDiff<T>(a: readonly T[], b: readonly T[]): Edit[] {
  if (a.length === 0 && b.length === 0) return [];

  let prefix = 0;
  const bound = Math.min(a.length, b.length);
  while (prefix < bound && a[prefix] === b[prefix]) prefix++;

  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > prefix && bEnd > prefix && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
  }

  const mid = diffMiddle(a.slice(prefix, aEnd), b.slice(prefix, bEnd));
  const out: Edit[] = [];
  if (prefix > 0) {
    out.push({
      type: "equal",
      aStart: 0,
      aEnd: prefix,
      bStart: 0,
      bEnd: prefix,
    });
  }
  for (const edit of mid) {
    out.push({
      type: edit.type,
      aStart: edit.aStart + prefix,
      aEnd: edit.aEnd + prefix,
      bStart: edit.bStart + prefix,
      bEnd: edit.bEnd + prefix,
    });
  }
  if (aEnd < a.length) {
    out.push({
      type: "equal",
      aStart: aEnd,
      aEnd: a.length,
      bStart: bEnd,
      bEnd: b.length,
    });
  }
  return coalesce(out);
}

function diffMiddle<T>(a: readonly T[], b: readonly T[]): Edit[] {
  const oldLen = a.length;
  const newLen = b.length;
  if (oldLen === 0 && newLen === 0) return [];
  if (oldLen === 0) {
    return [{ type: "insert", aStart: 0, aEnd: 0, bStart: 0, bEnd: newLen }];
  }
  if (newLen === 0) {
    return [{ type: "delete", aStart: 0, aEnd: oldLen, bStart: 0, bEnd: 0 }];
  }

  const best = new Map<number, PathNode>();
  best.set(0, { oldPos: -1, last: null });
  let newPos = extractCommon(best.get(0)!, a, b, 0);
  if (best.get(0)!.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
    return compsToEdits(best.get(0)!.last);
  }

  const max = oldLen + newLen;
  let minDiag = -Infinity;
  let maxDiag = Infinity;

  for (let editLength = 1; editLength <= max; editLength++) {
    for (
      let diag = Math.max(minDiag, -editLength);
      diag <= Math.min(maxDiag, editLength);
      diag += 2
    ) {
      const removePath = best.get(diag - 1);
      const addPath = best.get(diag + 1);
      if (removePath) best.delete(diag - 1);

      let canAdd = false;
      if (addPath) {
        const addNewPos = addPath.oldPos - diag;
        canAdd = addNewPos < newLen;
      }
      const canRemove = !!removePath && removePath.oldPos + 1 < oldLen;
      if (!canAdd && !canRemove) {
        best.delete(diag);
        continue;
      }

      let node: PathNode;
      if (!canRemove || (canAdd && removePath!.oldPos < addPath!.oldPos)) {
        node = {
          oldPos: addPath!.oldPos,
          last: { count: 1, added: true, removed: false, prev: addPath!.last },
        };
      } else {
        node = {
          oldPos: removePath!.oldPos + 1,
          last: {
            count: 1,
            added: false,
            removed: true,
            prev: removePath!.last,
          },
        };
      }

      newPos = extractCommon(node, a, b, diag);
      if (node.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
        return compsToEdits(node.last);
      }
      best.set(diag, node);
      if (node.oldPos + 1 >= oldLen) maxDiag = Math.min(maxDiag, diag - 1);
      if (newPos + 1 >= newLen) minDiag = Math.max(minDiag, diag + 1);
    }
  }

  return [
    { type: "delete", aStart: 0, aEnd: oldLen, bStart: 0, bEnd: 0 },
    { type: "insert", aStart: oldLen, aEnd: oldLen, bStart: 0, bEnd: newLen },
  ];
}

function extractCommon<T>(
  node: PathNode,
  a: readonly T[],
  b: readonly T[],
  diag: number,
): number {
  let oldPos = node.oldPos;
  let newPos = oldPos - diag;
  let count = 0;
  while (
    oldPos + 1 < a.length &&
    newPos + 1 < b.length &&
    a[oldPos + 1] === b[newPos + 1]
  ) {
    oldPos++;
    newPos++;
    count++;
  }
  if (count > 0) {
    node.last = { count, added: false, removed: false, prev: node.last };
  }
  node.oldPos = oldPos;
  return newPos;
}

function compsToEdits(last: Comp | null): Edit[] {
  const parts: Comp[] = [];
  let cursor = last;
  while (cursor) {
    parts.push(cursor);
    cursor = cursor.prev;
  }
  parts.reverse();
  const edits: Edit[] = [];
  let ai = 0;
  let bi = 0;
  for (const part of parts) {
    if (!part.added && !part.removed) {
      edits.push({
        type: "equal",
        aStart: ai,
        aEnd: ai + part.count,
        bStart: bi,
        bEnd: bi + part.count,
      });
      ai += part.count;
      bi += part.count;
    } else if (part.removed) {
      edits.push({
        type: "delete",
        aStart: ai,
        aEnd: ai + part.count,
        bStart: bi,
        bEnd: bi,
      });
      ai += part.count;
    } else {
      edits.push({
        type: "insert",
        aStart: ai,
        aEnd: ai,
        bStart: bi,
        bEnd: bi + part.count,
      });
      bi += part.count;
    }
  }
  return coalesce(edits);
}

function coalesce(edits: Edit[]): Edit[] {
  const out: Edit[] = [];
  for (const edit of edits) {
    if (edit.aStart === edit.aEnd && edit.bStart === edit.bEnd) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === edit.type &&
      prev.aEnd === edit.aStart &&
      prev.bEnd === edit.bStart
    ) {
      prev.aEnd = edit.aEnd;
      prev.bEnd = edit.bEnd;
    } else {
      out.push({ ...edit });
    }
  }
  return out;
}
