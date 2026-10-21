import type { Analysis } from "./provenance";
import { applySplices, type Splice } from "./render";
import type { Note, ResolvedOptions, SavedRef, StreamItem } from "./types";
import { scanTokens, type RefHit } from "./wikiscan";

export function passRefs(
  items: StreamItem[],
  notes: Note[],
  analysis: Analysis,
  options: ResolvedOptions,
  tainted: ReadonlySet<number>,
  nextUid: () => number,
): { items: StreamItem[]; notes: Note[] } {
  const scan = scanTokens(
    items.map((item) => ({
      id: item.tokenId,
      text: item.text,
      gapAfter: item.gapAfter,
    })),
  );
  const indexOf = new Map<number, number>();
  items.forEach((item, index) => {
    if (!indexOf.has(item.tokenId)) indexOf.set(item.tokenId, index);
  });
  const byName = new Map<string, RefHit[]>();
  for (const ref of scan.refs) {
    if (!ref.name) continue;
    const list = byName.get(ref.name);
    if (list) list.push(ref);
    else byName.set(ref.name, [ref]);
  }

  const splices: Splice[] = [];
  const used = new Set<number>();

  for (const [name, refs] of byName) {
    const defs = refs.filter((ref) => ref.kind === "def");
    const uses = refs.filter((ref) => ref.kind === "use");
    if (uses.length > 0 && defs.length === 0) {
      const saved = findDefinition(name, analysis, tainted, options);
      const usable =
        saved !== undefined &&
        (options.taintedRefPolicy === "keep" || !saved.contentTainted);
      if (usable && saved) {
        const located = locate(uses[0]!, indexOf);
        if (located && !overlaps(used, located)) {
          mark(used, located);
          const insert = saved.tokens.map((token) => ({
            uid: nextUid(),
            tokenId: token.id,
            text: token.text,
            gapAfter: token.gapAfter,
            origin: token.origin,
            finalIndex: null,
            restored: true,
          }));
          splices.push({
            start: located[0],
            end: located[1],
            insert,
            notes: [
              {
                action: "deorphan",
                details: [`rev:${saved.revid}`, `name:${name}`],
                start: 0,
                end: Math.max(insert.length, 0),
              },
            ],
          });
        }
      } else {
        for (const use of uses) {
          const located = locate(use, indexOf);
          if (!located || overlaps(used, located)) continue;
          mark(used, located);
          splices.push({
            start: located[0],
            end: located[1],
            insert: [],
            notes: [],
          });
        }
        const first = uses
          .map((use) => locate(use, indexOf))
          .find((range) => range !== null);
        if (first) {
          splices.push({
            start: first[0],
            end: first[0],
            insert: [],
            notes: [
              {
                action: "remove-orphan-ref",
                details: [`name:${name}`],
                start: 0,
                end: 0,
              },
            ],
          });
        }
      }
    }

    for (const ref of refs) {
      if (!ref.listDefined || ref.kind !== "def") continue;
      const usedOutside = refs.some(
        (other) => other !== ref && !other.listDefined,
      );
      if (usedOutside) continue;
      const located = locate(ref, indexOf);
      if (!located || overlaps(used, located)) continue;
      mark(used, located);
      splices.push({
        start: located[0],
        end: located[1],
        insert: [],
        notes: [
          {
            action: "remove-unused-ref",
            details: [`name:${name}`],
            start: 0,
            end: 0,
          },
        ],
      });
    }
  }

  const next = applySplices(
    items,
    notes,
    splices.filter(
      (splice) => splice.end > splice.start || splice.notes.length > 0,
    ),
  );
  return next;
}

function findDefinition(
  name: string,
  analysis: Analysis,
  tainted: ReadonlySet<number>,
  options: ResolvedOptions,
): SavedRef | undefined {
  const final = analysis.savedRefs.filter(
    (ref) => ref.revid === analysis.finalRevid && ref.name === name,
  );
  const fromFinal = pick(final, tainted, options);
  if (fromFinal) return fromFinal;
  const sourceOrder = [...analysis.sourceRevids].reverse();
  for (const revid of sourceOrder) {
    const found = pick(
      analysis.savedRefs.filter(
        (ref) => ref.revid === revid && ref.name === name,
      ),
      tainted,
      options,
    );
    if (found) return found;
  }
  return pick(
    analysis.savedRefs.filter((ref) => ref.name === name),
    tainted,
    options,
  );
}

function pick(
  refs: SavedRef[],
  tainted: ReadonlySet<number>,
  options: ResolvedOptions,
): SavedRef | undefined {
  if (options.taintedRefPolicy === "drop") {
    return refs.find(
      (ref) => !ref.contentTainted && !tainted.has(ref.openerOrigin),
    );
  }
  return refs[0];
}

function locate(
  ref: RefHit,
  indexOf: Map<number, number>,
): [number, number] | null {
  const indexes = ref.tokenIds
    .map((id) => indexOf.get(id))
    .filter((index): index is number => index !== undefined);
  if (indexes.length === 0) return null;
  return [Math.min(...indexes), Math.max(...indexes) + 1];
}

function overlaps(used: Set<number>, range: [number, number]): boolean {
  for (let i = range[0]; i < range[1]; i++) if (used.has(i)) return true;
  return false;
}

function mark(used: Set<number>, range: [number, number]) {
  for (let i = range[0]; i < range[1]; i++) used.add(i);
}
