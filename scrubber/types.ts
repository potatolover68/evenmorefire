export type Pos = [line: number, ch: number];

export type Action =
  | "remove-tainted"
  | "restore"
  | "superseded"
  | "anchor-lost"
  | "kept-tainted-revert"
  | "drop-derivative"
  | "flag-derivative"
  | "flag-paraphrase"
  | "markup-repair"
  | "flag-unbalanced"
  | "deorphan"
  | "remove-orphan-ref"
  | "remove-unused-ref"
  | "remove-empty-section"
  | "flag-empty-section"
  | "flag-fragment"
  | "remove-fragment"
  | "all-tainted"
  | "warn-unknown-revid"
  | "warn-tainted-hidden";

export interface Explanation {
  start: Pos;
  end: Pos;
  action: string;
  details?: string[];
  /** Span in the latest revision, for text that was removed from it. */
  latestStart?: Pos;
  latestEnd?: Pos;
}

export interface Revision {
  revid: number;
  content: string | null;
  /** ISO timestamp, when the caller knows it. */
  timestamp?: string;
  user?: string;
  comment?: string;
  /** MediaWiki bot flag. */
  bot?: boolean;
  /** Change tags, such as `OAuth CID: 678`. */
  tags?: string[];
  /**
   * MediaWiki content hash. Set when the text itself was not downloaded.
   * A present hash means the revision is visible.
   */
  sha1?: string;
  /** MediaWiki byte size, when the text itself was not downloaded. */
  size?: number;
}

/** 1-based line positions, matching deprecated-parameter comments. */
export interface SectionComment {
  startLine: number;
  startCh: number;
  endLine: number;
  endCh: number;
  text: string;
}

export interface RestoredSectionInput {
  heading: string | null;
  text: string;
  /** Timestamp of the oldest restored revision, when known. */
  restoredAt: string | null;
}

export type OnRestoredSection = (
  section: RestoredSectionInput,
) =>
  | { text: string; comments: SectionComment[] }
  | Promise<{ text: string; comments: SectionComment[] }>;

export interface Options {
  derivativeDropThreshold?: number;
  derivativeFlagThreshold?: number;
  taintedRefPolicy?: "keep" | "drop";
  restoreAnchorWindow?: number;
  /**
   * Do not roll a bot or maintenance edit back to an older revision.
   * The token scrub keeps that edit's text instead.
   */
  keepBots?: boolean;
  /**
   * Keep tables, infoboxes, categories, references, files, and short
   * descriptions from a tainted revision. Prose from that revision is still
   * removed.
   */
  skipNonProse?: boolean;
  /**
   * Delete a sentence fragment left behind after the rest of its sentence
   * was removed.
   */
  avoidOrphans?: boolean;
  /**
   * When set, `cleanTaintedHistory` returns a promise and runs this on each
   * restored section after orphan rescue.
   */
  onRestoredSection?: OnRestoredSection;
}

export interface ResolvedOptions {
  derivativeDropThreshold: number;
  derivativeFlagThreshold: number;
  taintedRefPolicy: "keep" | "drop";
  restoreAnchorWindow: number;
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  derivativeDropThreshold: 0.5,
  derivativeFlagThreshold: 0.2,
  taintedRefPolicy: "keep",
  restoreAnchorWindow: 50,
};

/** Exact-match revert lookback, in non-null revisions. */
export const REVERT_LOOKBACK = 20;

/** Above this many tokens, skip alignment and treat the revision as a full replace. */
export const MYERS_TOKEN_CAP = 20_000;

/**
 * Minimum symmetric LCS ratio for reusing tokens between two sentences.
 * Below this, the old sentence is deleted and the new one is inserted whole.
 */
export const SENTENCE_REUSE_THRESHOLD = 0.6;

export interface TokenEvent {
  rev: number;
  kind: "in" | "out";
}

export interface Token {
  id: number;
  value: string;
  origin: number;
  events: TokenEvent[];
  lastSeenRev: number;
  claimedGen: number;
  /** Inside a table, block template, category, reference, or file. */
  structural?: boolean;
}

export interface SentenceObj {
  key: string;
  tokens: Token[];
  claimedGen: number;
}

export interface ParagraphObj {
  key: string;
  sentences: SentenceObj[];
  claimedGen: number;
}

export interface Hunk {
  rev: number;
  deleted: Token[];
  /** Source gapAfter for each deleted token, including the seam after the run. */
  deletedGapAfter: string[];
  /** Whitespace in the source immediately before the first deleted token. */
  gapBefore: string;
  deletedText: string;
  inserted: Token[];
  /** Nearest first. */
  leftAnchorIds: number[];
  /** Nearest first. */
  rightAnchorIds: number[];
}

export interface ParaphraseNote {
  rev: number;
  insertedIds: number[];
  removedTaintedIds: number[];
}

export interface SavedRefToken {
  id: number;
  text: string;
  gapAfter: string;
  origin: number;
}

export interface SavedRef {
  name: string;
  revid: number;
  openerOrigin: number;
  /** Opener origin is tainted, or any content token's origin is tainted. */
  contentTainted: boolean;
  tokens: SavedRefToken[];
  listDefined: boolean;
}

export interface StreamItem {
  uid: number;
  tokenId: number;
  text: string;
  gapAfter: string;
  origin: number;
  /** Index in the final revision, when this token appears there. */
  finalIndex: number | null;
  restored: boolean;
}

/** Item-index range. `start === end` is zero-width before that item (or at EOF). */
export interface Note {
  action: string;
  details?: string[];
  start: number;
  end: number;
  /** Span in the latest revision, when this note describes removed text. */
  latestStart?: Pos;
  latestEnd?: Pos;
}

export function resolveOptions(options?: Options): ResolvedOptions {
  return {
    derivativeDropThreshold:
      options?.derivativeDropThreshold ??
      DEFAULT_OPTIONS.derivativeDropThreshold,
    derivativeFlagThreshold:
      options?.derivativeFlagThreshold ??
      DEFAULT_OPTIONS.derivativeFlagThreshold,
    taintedRefPolicy:
      options?.taintedRefPolicy ?? DEFAULT_OPTIONS.taintedRefPolicy,
    restoreAnchorWindow:
      options?.restoreAnchorWindow ?? DEFAULT_OPTIONS.restoreAnchorWindow,
  };
}
