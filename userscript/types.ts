import type { Explanation } from "../scrubber/types.ts";

export type HighlightReason = "filters" | "manual" | "excluded";

export type Step = 1 | 2 | 3;

export type CleanupReason = "AI" | "CV" | "other" | "";

export type JobStatus =
  | "pending"
  | "processing"
  | "processed"
  | "flagged"
  | "review"
  | "prod"
  | "aitag"
  | "applied"
  | "skipped"
  | "undone";

export interface FilterConfig {
  minBytes: number | null;
  maxBytes: number | null;
  after: string | null;
  before: string | null;
  excludeAuto: boolean;
  summaryRegex: string;
  summaryCaseSensitive: boolean;
  excludeCreations: boolean;
  /** Later edits to pages this user created. */
  excludeFollowups: boolean;
  /** When set, only page creations match. */
  includeCreations: boolean;
  /** Drop creations in Category:All disambiguation pages. Applies only with includeCreations. */
  excludeDisambiguations: boolean;
  /** Drop creations that are redirects. Applies only with includeCreations. */
  excludeRedirects: boolean;
  /** Null means every namespace. */
  namespaces: number[] | null;
}

export interface CleanupConfig {
  auto: boolean;
  revdel: boolean;
  trackingPage: string;
  summary: string;
  reason: CleanupReason;
  llmprod: boolean;
  llmprodPercent: number | null;
  llmprodAuto: boolean;
  /** Tag a creation instead of scrubbing it. */
  aiTag: boolean;
  aiTagPercent: number | null;
  /** Leave bot and maintenance edits in place. */
  keepBots: boolean;
  /** Keep tables, infoboxes, categories, references, files, and short descriptions. */
  skipNonProse: boolean;
}

export interface RevisionMeta {
  title: string;
  timestamp: string;
  isNew: boolean;
  pageid: number | null;
  ns: number;
}

export interface PageJob {
  title: string;
  status: JobStatus;
  taintedRevids: number[];
  isNew: boolean;
  pageid: number | null;
  /** Earliest tainted revision on the page, by timestamp. */
  anchorRevid: number | null;
  content: string | null;
  explanations: Explanation[];
  baseRevid: number | null;
  baseTimestamp: string | null;
  savedRevid: number | null;
}

export interface Session {
  key: string;
  step: Step;
  position: { top: number; left: number } | null;
  filters: FilterConfig | null;
  cleanup: CleanupConfig;
  highlights: Record<string, HighlightReason>;
  metas: Record<string, RevisionMeta>;
  jobs: Record<string, PageJob>;
  /** Follow the contributions pager and keep cleaning after this page. */
  autoAdvance: boolean;
}

export interface NamespaceInfo {
  id: number;
  name: string;
}

export function defaultCleanup(): CleanupConfig {
  return {
    auto: false,
    revdel: false,
    trackingPage: "",
    summary: "",
    reason: "",
    llmprod: false,
    llmprodPercent: null,
    llmprodAuto: false,
    aiTag: false,
    aiTagPercent: null,
    keepBots: false,
    skipNonProse: false,
  };
}

export function emptySession(key: string): Session {
  return {
    key,
    step: 1,
    position: null,
    filters: null,
    cleanup: defaultCleanup(),
    highlights: {},
    metas: {},
    jobs: {},
    autoAdvance: false,
  };
}

export function selectedCount(
  highlights: Record<string, HighlightReason>,
): number {
  let count = 0;
  for (const reason of Object.values(highlights)) {
    if (reason === "filters" || reason === "manual") count += 1;
  }
  return count;
}

export function hasPending(session: Session): boolean {
  return Object.values(session.jobs).some(
    (job) =>
      job.status === "pending" ||
      job.status === "processing" ||
      job.status === "processed",
  );
}

export interface EditCounts {
  applied: number;
  skipped: number;
  flagged: number;
  review: number;
  prod: number;
  aitag: number;
  total: number;
}

/** Count selected edits on these pages by the page's cleanup status. */
export function countEdits(jobs: readonly PageJob[]): EditCounts {
  const counts: EditCounts = {
    applied: 0,
    skipped: 0,
    flagged: 0,
    review: 0,
    prod: 0,
    aitag: 0,
    total: 0,
  };
  for (const job of jobs) {
    const edits = job.taintedRevids.length;
    counts.total += edits;
    if (job.status === "applied") counts.applied += edits;
    else if (job.status === "skipped") counts.skipped += edits;
    else if (job.status === "flagged") counts.flagged += edits;
    else if (job.status === "prod") counts.prod += edits;
    else if (job.status === "aitag") counts.aitag += edits;
    else if (job.status === "review" || job.status === "processed") {
      counts.review += edits;
    }
  }
  return counts;
}

export function sameCleanup(a: CleanupConfig, b: CleanupConfig): boolean {
  return (
    JSON.stringify(normalizeCleanup(a)) === JSON.stringify(normalizeCleanup(b))
  );
}

function normalizeCleanup(config: CleanupConfig): CleanupConfig {
  return {
    auto: config.auto,
    revdel: config.revdel,
    trackingPage: config.trackingPage.trim(),
    summary: config.summary,
    reason: config.reason,
    llmprod: config.llmprod,
    llmprodPercent: config.llmprodPercent,
    llmprodAuto: config.llmprodAuto === true,
    aiTag: config.aiTag === true,
    aiTagPercent: config.aiTagPercent ?? null,
    keepBots: config.keepBots === true,
    skipNonProse: config.skipNonProse === true,
  };
}
