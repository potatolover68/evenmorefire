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
}
