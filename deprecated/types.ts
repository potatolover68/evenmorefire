export interface SnippetComment {
  startLine: number;
  startCh: number;
  endLine: number;
  endCh: number;
  text: string;
}

/** Raw template revision; tests and injectors may still supply these. */
export interface TemplateRevision {
  revid: number;
  timestamp: string;
  content: string;
}

export interface DeclaredPair {
  from: string;
  to: string;
}

export interface RegexpRule {
  find: string;
  replace: string;
}

/**
 * One rule-set era.
 * - `timestamp` - when this set became active (first rev of a collapsed run).
 * - `revid` / `revisedAt` - the latest revision that still had these rules.
 */
export interface ParsedRevision {
  revid: number;
  timestamp: string;
  revisedAt: string;
  pairs: DeclaredPair[];
  regexps: RegexpRule[];
}

/** Compact, content-free template history used by the hot path. */
export interface TemplateHistory {
  title: string;
  /** Latest revision id when known; null if the page is missing. */
  tipRevid: number | null;
  legal: ReadonlySet<string>;
  revisions: readonly ParsedRevision[];
  /**
   * How far back `revisions` reaches; only histories with coverage may be
   * reused from the cache. Absent when history was never walked.
   */
  coverage?: HistoryCoverage;
}

export interface HistoryCoverage {
  /** Timestamp of the oldest revision fetched. */
  oldest: string;
  /** True when the walk ran out of history or hit its cap, not the snippet. */
  exhausted: boolean;
}
