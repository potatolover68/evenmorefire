import type { Revision, Token } from "./types";
import { REVERT_LOOKBACK } from "./types";
import { normalizeNewlines } from "./split";

const MAINTENANCE_TAGS = new Set([
  "OAuth CID: 678",
  "OAuth CID: 2922",
]);

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

export function revertRevids(revisions: readonly Revision[]): Set<number> {
  const seen: string[] = [];
  const out = new Set<number>();
  for (const rev of revisions) {
    if (rev.content == null) continue;
    const text = normalizeNewlines(rev.content);
    const window = seen.slice(-REVERT_LOOKBACK);
    if (window.includes(text)) out.add(rev.revid);
    seen.push(text);
  }
  return out;
}

export interface TrivialRollback {
  content: string;
  /** Tainted revisions dropped, oldest first. */
  undone: number[];
  /** Tainted exact revert the rollback stopped on, when that revert is kept. */
  keptRevert: number | null;
  /** True when the tainted run goes back through the first revision. */
  emptied: boolean;
}

/**
 * When every tainted revision is in a trailing run, the scrub is the text
 * before that run. A tainted exact revert ends the run and is kept, so a
 * rollback does not restore the vandalism it undid. Bot and maintenance
 * edits are skipped, so reFill, IABot, or a subst bot does not end the run.
 * Returns null when an older tainted edit still needs the full scrub, or a
 * hidden revision sits in the run.
 */
export function trivialRollback(
  revisions: readonly Revision[],
  tainted: ReadonlySet<number>,
  reverts: ReadonlySet<number>,
): TrivialRollback | null {
  const undone: number[] = [];
  let kept: Revision | null = null;
  for (let i = revisions.length - 1; i >= 0; i--) {
    const revision = revisions[i]!;
    if (revision.content == null) return null;
    if (isMaintenance(revision)) continue;
    if (!tainted.has(revision.revid) || reverts.has(revision.revid)) {
      kept = revision;
      break;
    }
    undone.push(revision.revid);
  }
  if (undone.length === 0) return null;
  const accounted = new Set(undone);
  if (kept && tainted.has(kept.revid)) accounted.add(kept.revid);
  for (const revision of revisions) {
    if (revision.content == null || !tainted.has(revision.revid)) continue;
    if (!accounted.has(revision.revid)) return null;
  }
  undone.reverse();
  return {
    content: kept?.content ?? "",
    undone,
    keptRevert: kept && tainted.has(kept.revid) ? kept.revid : null,
    emptied: kept == null,
  };
}

/** Origin-tainted tokens stay out. Tainted events are ignored unless that revision is an exact revert. */
export function isPresent(
  token: Token,
  tainted: ReadonlySet<number>,
  reverts: ReadonlySet<number>,
): boolean {
  if (tainted.has(token.origin)) return false;
  const evs = token.events.filter(
    (event) => !tainted.has(event.rev) || reverts.has(event.rev),
  );
  if (evs.length === 0) return true;
  return evs[evs.length - 1]!.kind === "in";
}
