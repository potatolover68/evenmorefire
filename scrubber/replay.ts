import { nonProseChanged } from "./nonprose";
import type { Revision, Token } from "./types";
import { REVERT_LOOKBACK } from "./types";
import { normalizeNewlines } from "./split";

const MAINTENANCE_TAGS = new Set(["OAuth CID: 678", "OAuth CID: 2922"]);

/** Bot accounts, and maintenance tools such as reFill, ProveIt, or IABot. */
export function isMaintenance(revision: Revision): boolean {
  const comment = revision.comment ?? "";
  if (/^reverted\b/i.test(comment)) return false;
  if (revision.bot) return true;
  if (revision.tags?.some((tag) => MAINTENANCE_TAGS.has(tag))) return true;
  const user = revision.user?.trim() ?? "";
  if (user.length > 3 && /bot$/i.test(user)) return true;
  return (
    /refill|#iabot|#proveit|substing templates/i.test(comment) ||
    /filled in \d+ bare references? with refill 2/i.test(comment)
  );
}

/** Hidden when neither the text nor a content hash is available. */
export function isRevisionHidden(revision: Revision): boolean {
  return revision.content == null && !revision.sha1;
}

export interface RevertTracker {
  push(revision: Revision): void;
  revids(): Set<number>;
}

/** Exact-match reverts, remembering only the last {@link REVERT_LOOKBACK} identities. */
export function createRevertTracker(): RevertTracker {
  const ring: string[] = [];
  const out = new Set<number>();
  return {
    push(revision) {
      const identity = revisionIdentity(revision);
      if (identity == null) return;
      if (ring.includes(identity)) out.add(revision.revid);
      ring.push(identity);
      if (ring.length > REVERT_LOOKBACK) ring.shift();
    },
    revids: () => out,
  };
}

export function revertRevids(revisions: readonly Revision[]): Set<number> {
  const tracker = createRevertTracker();
  for (const revision of revisions) tracker.push(revision);
  return tracker.revids();
}

function revisionIdentity(revision: Revision): string | null {
  if (revision.content != null) return normalizeNewlines(revision.content);
  if (revision.sha1) return `\0sha1:${revision.sha1}`;
  return null;
}

export interface TrivialRollback {
  /** Kept revision text, or null when that text has not been loaded. */
  content: string | null;
  /** Tainted revisions dropped, oldest first. */
  undone: number[];
  /** Tainted exact revert the rollback stopped on, when that revert is kept. */
  keptRevert: number | null;
  /** True when the tainted run goes back through the first revision. */
  emptied: boolean;
  /** Revision whose text is the scrub. Null when the page is emptied. */
  keptRevid: number | null;
}

/**
 * When every tainted revision is in a trailing run, the scrub is the text
 * before that run. A tainted exact revert ends the run and is kept, so a
 * rollback does not restore the vandalism it undid. A bot edit inside the
 * run is skipped, so reFill or IABot does not hide an older tainted edit.
 * A bot edit underneath the run is kept. `keepBots` refuses a wholesale
 * rollback that would discard any bot edit, and the token scrub keeps it.
 * Returns null when an older tainted edit still needs the full scrub, or a
 * hidden revision sits in the run.
 */
export function trivialRollback(
  revisions: readonly Revision[],
  tainted: ReadonlySet<number>,
  reverts: ReadonlySet<number>,
  keepBots = false,
  skipNonProse = false,
): TrivialRollback | null {
  const undone: number[] = [];
  let kept: Revision | null = null;
  for (let i = revisions.length - 1; i >= 0; i--) {
    const revision = revisions[i]!;
    if (isRevisionHidden(revision)) return null;
    if (isMaintenance(revision)) {
      if (keepBots) return null;
      if (undone.length === 0) continue;
      const older = olderSolid(revisions, i);
      if (older === "hidden") return null;
      const olderRev = older < 0 ? null : revisions[older];
      const continues =
        olderRev != null &&
        tainted.has(olderRev.revid) &&
        !reverts.has(olderRev.revid);
      if (continues) continue;
      kept = revision;
      break;
    }
    if (!tainted.has(revision.revid) || reverts.has(revision.revid)) {
      kept = revision;
      break;
    }
    if (skipNonProse && revisionTouchesNonProse(revisions, i)) return null;
    undone.push(revision.revid);
  }
  if (undone.length === 0) return null;
  const accounted = new Set(undone);
  if (kept && tainted.has(kept.revid)) accounted.add(kept.revid);
  for (const revision of revisions) {
    if (isRevisionHidden(revision) || !tainted.has(revision.revid)) continue;
    if (!accounted.has(revision.revid)) return null;
  }
  undone.reverse();
  return {
    content: kept?.content ?? null,
    keptRevid: kept?.revid ?? null,
    undone,
    keptRevert: kept && tainted.has(kept.revid) ? kept.revid : null,
    emptied: kept == null,
  };
}

function revisionTouchesNonProse(
  revisions: readonly Revision[],
  index: number,
): boolean {
  const text = revisions[index]?.content;
  if (text == null) return true;
  const parent = index > 0 ? revisions[index - 1]?.content : null;
  return nonProseChanged(
    parent == null ? "" : normalizeNewlines(parent),
    normalizeNewlines(text),
  );
}

/** Index of the nearest older non-bot revision, or -1. `"hidden"` when a deleted revision blocks the walk. */
function olderSolid(
  revisions: readonly Revision[],
  from: number,
): number | "hidden" {
  for (let j = from - 1; j >= 0; j--) {
    const revision = revisions[j]!;
    if (isRevisionHidden(revision)) return "hidden";
    if (!isMaintenance(revision)) return j;
  }
  return -1;
}

/** Origin-tainted tokens stay out, except structural non-prose. Tainted events are ignored unless that revision is an exact revert. */
export function isPresent(
  token: Token,
  tainted: ReadonlySet<number>,
  reverts: ReadonlySet<number>,
): boolean {
  if (tainted.has(token.origin) && !token.structural) return false;
  const evs = token.events.filter(
    (event) => !tainted.has(event.rev) || reverts.has(event.rev),
  );
  if (evs.length === 0) return true;
  return evs[evs.length - 1]!.kind === "in";
}
