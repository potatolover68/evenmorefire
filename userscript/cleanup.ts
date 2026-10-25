import { refreshDeprecatedParameters } from "../deprecated/refresh.ts";
import { cleanTaintedHistory, type Revision } from "../scrubber/index.ts";
import type { Explanation } from "../scrubber/types.ts";
import { markArticleCompleted, type RowStatus } from "./aic.ts";
import { nextContributionsHref, titlesOnPage } from "./contribs.ts";
import {
  EditConflict,
  expandWikitext,
  fetchHistory,
  hasCategory,
  hideRevisionContents,
  latestRevision,
  latestRevisionId,
  pageIdOf,
  pageCreationRevid,
  readPage,
  revisionIdsBetween,
  savePage,
  undoRevision,
  userEditorKeys,
} from "./mediawiki.ts";
import { openReview } from "./review.ts";
import {
  preparedReview,
  reviewInflight,
  scheduleReview,
} from "./review-cache.ts";
import { aiTagTemplate, editSummary, prodTemplate } from "./summary.ts";
import type { CleanupReason, PageJob, Session } from "./types.ts";
import { defaultCleanup, emptySession } from "./types.ts";
import { authorshipPercent } from "./wikiwho.ts";

export interface CleanupHost {
  user: string;
  session: Session;
  running: boolean;
  setRunning(running: boolean): void;
  persist(): Promise<void>;
  refresh(): void;
}

let trackingChain: Promise<void> = Promise.resolve();

export function syncJobs(session: Session): void {
  const groups = new Map<
    string,
    { ids: number[]; isNew: boolean; pageid: number | null }
  >();
  for (const [id, reason] of Object.entries(session.highlights)) {
    if (reason === "excluded") continue;
    const meta = session.metas[id];
    if (!meta) continue;
    const group = groups.get(meta.title) ?? {
      ids: [],
      isNew: false,
      pageid: null,
    };
    group.ids.push(Number(id));
    group.isNew ||= meta.isNew;
    if (group.pageid == null) group.pageid = meta.pageid;
    groups.set(meta.title, group);
  }
  const next: Record<string, PageJob> = {};
  for (const [title, group] of groups) {
    const ids = [...group.ids].sort((a, b) => a - b);
    const existing = session.jobs[title];
    const same = existing != null && sameIds(existing.taintedRevids, ids);
    if (
      existing &&
      (sparedFromScrub(existing) || (same && existing.status !== "processing"))
    ) {
      if (!sparedFromScrub(existing)) existing.isNew = group.isNew;
      existing.pageid = existing.pageid ?? group.pageid;
      next[title] = existing;
      continue;
    }
    next[title] = {
      title,
      status: "pending",
      taintedRevids: ids,
      isNew: group.isNew,
      pageid: group.pageid,
      anchorRevid: null,
      content: null,
      explanations: [],
      baseRevid: null,
      baseTimestamp: null,
      savedRevid: null,
    };
  }
  for (const [title, job] of Object.entries(session.jobs)) {
    if (!next[title] && (job.status === "applied" || job.status === "undone")) {
      next[title] = job;
    }
  }
  session.jobs = next;
}

export async function runQueue(host: CleanupHost): Promise<void> {
  if (host.running) return;
  host.setRunning(true);
  host.refresh();
  const visible = titlesOnPage(host.session);
  let advanceTo: string | null = null;
  try {
    for (const title of [...visible].sort()) {
      if (!host.running) return;
      const job = host.session.jobs[title];
      if (!job) continue;
      if (
        job.status !== "pending" &&
        job.status !== "processing" &&
        job.status !== "processed"
      ) {
        continue;
      }
      await processJob(host, job);
    }
    if (
      host.running &&
      host.session.cleanup.auto &&
      pageIsClear(host.session, visible) &&
      hasPendingElsewhere(host.session, visible)
    ) {
      advanceTo = nextContributionsHref();
    }
  } finally {
    host.setRunning(false);
    if (advanceTo) host.session.autoAdvance = true;
    await host.persist();
    host.refresh();
    if (advanceTo) location.assign(advanceTo);
  }
}

function pageIsClear(session: Session, visible: ReadonlySet<string>): boolean {
  for (const title of visible) {
    const status = session.jobs[title]?.status;
    if (!status) continue;
    if (status === "applied" || status === "skipped" || status === "undone") {
      continue;
    }
    return false;
  }
  return true;
}

function hasPendingElsewhere(
  session: Session,
  visible: ReadonlySet<string>,
): boolean {
  return Object.entries(session.jobs).some(([title, job]) => {
    if (visible.has(title)) return false;
    return (
      job.status === "pending" ||
      job.status === "processing" ||
      job.status === "processed"
    );
  });
}

export async function reviewSelection(
  title: string,
  revids: number[],
  metas: Record<string, string>,
  cleanup: { reason: Exclude<CleanupReason, "">; summary: string },
  report: (text: string) => void,
): Promise<void> {
  const session = emptySession("history");
  session.cleanup = {
    ...defaultCleanup(),
    reason: cleanup.reason,
    summary: cleanup.summary,
  };
  const ids = [...revids].sort((a, b) => a - b);
  for (const revid of ids) {
    session.metas[String(revid)] = {
      title,
      timestamp: metas[String(revid)] || String(revid).padStart(12, "0"),
      isNew: false,
      pageid: null,
      ns: 0,
    };
  }
  const job: PageJob = {
    title,
    status: "pending",
    taintedRevids: ids,
    isNew: false,
    pageid: null,
    anchorRevid: null,
    content: null,
    explanations: [],
    baseRevid: null,
    baseTimestamp: null,
    savedRevid: null,
  };
  session.jobs[title] = job;
  const host: CleanupHost = {
    user: "",
    session,
    running: true,
    setRunning() {},
    persist() {
      return Promise.resolve();
    },
    refresh() {
      report(job.status === "processing" ? "Reading history…" : job.status);
    },
  };
  await processJob(host, job);
  if (job.status === "skipped") {
    report("Nothing to remove.");
    return;
  }
  await openJob(host, title);
  report("Review opened.");
}

export async function openJob(host: CleanupHost, title: string): Promise<void> {
  const job = host.session.jobs[title];
  if (!job) return;
  const proposal = job.content ?? "";
  const cached = preparedReview(title, job.baseRevid, proposal);
  const reason = requireReason(host);
  const handle = openReview({
    title,
    latestText: cached?.latestText ?? "",
    latestRevid: cached?.latestRevid ?? job.baseRevid ?? 0,
    baseRevid: job.baseRevid,
    proposal,
    rows: cached?.rows,
    explanations: job.explanations,
    taintedRevids: job.taintedRevids,
    status: job.status,
    origin: location.origin,
    revdel: host.session.cleanup.revdel,
    onApply: async (content) => {
      await commitEdit(host, job, content, host.session.cleanup.revdel);
    },
    onReject: async () => {
      job.status = "skipped";
      await host.persist();
      host.refresh();
    },
    onUndo: async () => {
      if (job.savedRevid == null) throw new Error("Nothing to undo");
      await undoRevision(
        job.title,
        job.savedRevid,
        editSummary(reason, host.session.cleanup.summary),
      );
      job.status = "undone";
      await host.persist();
      host.refresh();
    },
  });
  const watchMove = () => {
    void latestRevisionId(title)
      .then((revid) => handle.noteMoved(revid))
      .catch(() => {});
  };
  if (cached) {
    watchMove();
    return;
  }
  try {
    const pending = await reviewInflight(title, job.baseRevid, proposal);
    if (pending) {
      handle.show(pending.latestText, pending.latestRevid, pending.rows);
      watchMove();
      return;
    }
    const latest = await latestRevision(title);
    handle.show(latest.content, latest.revid);
  } catch (error) {
    handle.fail(error instanceof Error ? error.message : String(error));
  }
}

async function processJob(host: CleanupHost, job: PageJob): Promise<void> {
  if (sparedFromScrub(job)) {
    await park(host, job);
    return;
  }
  job.status = "processing";
  await host.persist();
  host.refresh();
  try {
    if (
      !job.isNew &&
      host.session.cleanup.reason === "AI" &&
      (host.session.cleanup.llmprod || host.session.cleanup.aiTag)
    ) {
      const created = await pageCreationRevid(job.title);
      if (created != null && job.taintedRevids.includes(created)) {
        job.isNew = true;
      }
    }
    if (job.isNew && (await hasCategory(job.title, PROD_CATEGORY))) {
      job.status = "skipped";
      job.explanations = [
        note("Already in Category:AI-generated content proposed for deletion"),
      ];
      await host.persist();
      host.refresh();
      await updateTracking(host, job.title, requireReason(host), "ongoing");
      return;
    }
    if (await maybeProd(host, job)) return;
    if (sparedFromScrub(job)) {
      await park(host, job);
      return;
    }
    if (!host.running || host.session.jobs[job.title] !== job) return;
    const oldest = anchorFromMetas(host, job);
    if (oldest == null) throw new Error("No tainted revisions");
    const history = await fetchHistory(job.title, oldest);
    if (host.session.jobs[job.title] !== job) return;
    job.anchorRevid = earliestRevid(history, job.taintedRevids);
    const result = await cleanTaintedHistory(history, job.taintedRevids, {
      keepBots: host.session.cleanup.keepBots,
      onRestoredSection: async (section) =>
        refreshDeprecatedParameters(
          section.text,
          [],
          section.restoredAt ?? new Date().toISOString(),
        ),
    });
    if (!host.running || host.session.jobs[job.title] !== job) return;
    const latest = [...history]
      .reverse()
      .find((revision) => revision.content != null);
    job.content = result.content;
    job.explanations = result.explanations;
    job.baseRevid = latest?.revid ?? null;
    job.baseTimestamp = latest?.timestamp ?? null;
    if (latest?.content != null) {
      scheduleReview(job.title, latest.content, latest.revid, result.content);
    }
    job.status = "processed";
    await host.persist();
    host.refresh();
    if (!latest || result.content === latest.content) {
      job.status = "skipped";
      await host.persist();
      host.refresh();
      return;
    }
    const flagged = result.explanations.some(
      (note) =>
        note.action.startsWith("flag-") || note.action.startsWith("warn-"),
    );
    const auto =
      host.session.cleanup.auto &&
      !host.session.cleanup.revdel &&
      host.session.cleanup.reason === "AI" &&
      !flagged;
    if (!host.running) {
      job.status = "pending";
      await host.persist();
      host.refresh();
      return;
    }
    if (
      auto &&
      job.isNew &&
      host.session.cleanup.llmprod &&
      result.content.trim() === ""
    ) {
      job.content = latest?.content ?? "";
      job.status = "review";
      job.explanations = [
        ...result.explanations,
        note("Did not blank this page creation"),
      ];
      await host.persist();
      host.refresh();
      return;
    }
    if (auto) {
      await commitEdit(host, job, result.content, false);
      return;
    }
    job.status = flagged ? "flagged" : "review";
    await host.persist();
    host.refresh();
  } catch (error) {
    if (sparedFromScrub(job)) {
      await park(host, job);
      return;
    }
    if (!host.running) {
      job.status = "pending";
      await host.persist();
      host.refresh();
      return;
    }
    job.status = "review";
    job.explanations = [
      note(error instanceof Error ? error.message : String(error)),
    ];
    await host.persist();
    host.refresh();
  }
}

function sparedFromScrub(job: PageJob): boolean {
  return (
    job.status === "prod" ||
    job.status === "aitag" ||
    job.explanations.some(
      (item) => item.action === "llm-prod" || item.action === "ai-tag",
    )
  );
}

function holdStatus(job: PageJob): "prod" | "aitag" {
  if (
    job.status === "prod" ||
    job.explanations.some((item) => item.action === "llm-prod")
  ) {
    return "prod";
  }
  return "aitag";
}

async function park(host: CleanupHost, job: PageJob): Promise<void> {
  job.status = holdStatus(job);
  await host.persist();
  host.refresh();
}

const PROD_CATEGORY = "Category:AI-generated content proposed for deletion";
const AI_CATEGORY = "Category:Articles containing suspected AI-generated texts";

async function maybeProd(host: CleanupHost, job: PageJob): Promise<boolean> {
  const cleanup = host.session.cleanup;
  const prodOn =
    cleanup.llmprod &&
    cleanup.reason === "AI" &&
    cleanup.llmprodPercent != null;
  const tagOn =
    cleanup.aiTag && cleanup.reason === "AI" && cleanup.aiTagPercent != null;
  if ((!prodOn && !tagOn) || !job.isNew) return false;
  if (!host.running) return yieldJob(host, job);
  const pageid = job.pageid ?? (await pageIdOf(job.title));
  if (await yieldJob(host, job)) return true;
  if (pageid == null) return false;
  job.pageid = pageid;
  let percent: number;
  try {
    percent = await authorshipPercent(pageid, await userEditorKeys(host.user));
  } catch (error) {
    if (await yieldJob(host, job)) return true;
    job.explanations = [
      note(
        error instanceof Error
          ? `WikiWho: ${error.message}`
          : "WikiWho request failed",
      ),
    ];
    return false;
  }
  if (await yieldJob(host, job)) return true;
  const prod = prodOn && percent > (cleanup.llmprodPercent ?? 0);
  const tag = !prod && tagOn && percent > (cleanup.aiTagPercent ?? 0);
  if (!prod && !tag) return false;
  const latest = await latestRevision(job.title);
  if (await yieldJob(host, job)) return true;
  if (tag && (await hasCategory(job.title, AI_CATEGORY))) {
    job.status = "skipped";
    job.explanations = [note("Already tagged as AI-generated")];
    await host.persist();
    host.refresh();
    await updateTracking(host, job.title, requireReason(host), "tagged");
    return true;
  }
  let banner = prod
    ? prodTemplate(cleanup.summary)
    : aiTagTemplate(cleanup.summary);
  try {
    const expanded = await expandWikitext(job.title, banner);
    if (expanded.trim()) banner = expanded;
  } catch {
    // Keep the unsubstituted tag. The article text is still appended below.
  }
  if (await yieldJob(host, job)) return true;
  job.baseRevid = latest.revid;
  job.baseTimestamp = new Date().toISOString();
  job.anchorRevid = anchorFromMetas(host, job);
  job.content = `${banner.trim()}\n${latest.content}`;
  job.explanations = [
    {
      action: prod ? "llm-prod" : "ai-tag",
      start: [0, 0],
      end: [0, 0],
      details: [`authorship ${percent.toFixed(1)}%`],
    },
  ];
  scheduleReview(job.title, latest.content, latest.revid, job.content);
  const automatic = cleanup.llmprodAuto && !cleanup.revdel;
  if (!automatic) {
    job.status = prod ? "prod" : "aitag";
    await host.persist();
    host.refresh();
    return true;
  }
  if (await yieldJob(host, job)) return true;
  await commitEdit(host, job, job.content, false);
  return true;
}

function expandProdBanner(title: string, text: string): Promise<string> {
  const marker = /{{\s*(?:safe)?subst:/i;
  const at = text.search(marker);
  if (at === -1) return Promise.resolve(text);
  const lineEnd = text.indexOf("\n", at);
  const banner = lineEnd === -1 ? text.slice(at) : text.slice(at, lineEnd);
  const rest = lineEnd === -1 ? "" : text.slice(lineEnd + 1);
  return expandWikitext(title, banner).then((expanded) => {
    const tag = expanded.trim();
    if (!rest) return tag;
    return `${tag}\n${rest}`;
  });
}

async function commitEdit(
  host: CleanupHost,
  job: PageJob,
  content: string,
  revdel: boolean,
): Promise<void> {
  if (host.session.jobs[job.title] !== job) return;
  let text = content;
  const prod = job.explanations.some((item) => item.action === "llm-prod");
  const ai = job.explanations.some((item) => item.action === "ai-tag");
  const reason = requireReason(host);
  if (prod || ai) {
    if (prod && (await hasCategory(job.title, PROD_CATEGORY))) {
      job.status = "skipped";
      job.explanations = [
        ...job.explanations,
        note("Already in Category:AI-generated content proposed for deletion"),
      ];
      await host.persist();
      host.refresh();
      await updateTracking(host, job.title, reason, "ongoing");
      return;
    }
    if (ai && !prod && (await hasCategory(job.title, AI_CATEGORY))) {
      job.status = "skipped";
      job.explanations = [
        ...job.explanations,
        note("Already tagged as AI-generated"),
      ];
      await host.persist();
      host.refresh();
      await updateTracking(host, job.title, reason, "tagged");
      return;
    }
    text = await expandProdBanner(job.title, text);
  }
  const summary = editSummary(reason, host.session.cleanup.summary);
  const base = job.baseRevid;
  if (base == null) throw new Error("Missing base revision");
  const saved = await savePage(job.title, text, summary, base);
  job.savedRevid = saved;
  job.content = text;
  job.status = "applied";
  await host.persist();
  host.refresh();
  if (revdel && Morebits.userIsSysop && job.anchorRevid != null) {
    try {
      const ids = await revisionIdsBetween(job.title, job.anchorRevid, saved);
      await hideRevisionContents(job.title, ids, summary);
    } catch (error) {
      job.explanations = [
        ...job.explanations,
        note(error instanceof Error ? error.message : String(error)),
      ];
      await host.persist();
      host.refresh();
    }
  }
  const tracked: RowStatus = prod ? "ongoing" : ai ? "tagged" : "completed";
  await updateTracking(host, job.title, reason, tracked);
}

async function updateTracking(
  host: CleanupHost,
  title: string,
  reason: CleanupReason,
  status: RowStatus = "completed",
): Promise<void> {
  const page = host.session.cleanup.trackingPage.trim();
  if (!page) return;
  const run = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await readPage(page);
      const next = markArticleCompleted(current.text, title, status);
      if (next == null) return;
      try {
        await savePage(
          page,
          next,
          editSummary(reason, `marked [[${title}]] ${status}`),
          current.revid,
        );
        return;
      } catch (error) {
        if (!(error instanceof EditConflict) || attempt === 1) throw error;
      }
    }
  };
  trackingChain = trackingChain.then(run, run);
  await trackingChain;
}

function yieldJob(host: CleanupHost, job: PageJob): Promise<boolean> {
  if (host.running && host.session.jobs[job.title] === job) {
    return Promise.resolve(false);
  }
  if (host.session.jobs[job.title] !== job) return Promise.resolve(true);
  job.status = sparedFromScrub(job) ? holdStatus(job) : "pending";
  return host.persist().then(() => {
    host.refresh();
    return true;
  });
}

function requireReason(host: CleanupHost): Exclude<CleanupReason, ""> {
  const reason = host.session.cleanup.reason;
  if (reason === "AI" || reason === "CV" || reason === "other") return reason;
  throw new Error("Choose a reason");
}

function earliestRevid(
  history: readonly Revision[],
  ids: readonly number[],
): number | null {
  const wanted = new Set(ids);
  const hits = history.filter((revision) => wanted.has(revision.revid));
  hits.sort(
    (a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.revid - b.revid,
  );
  return hits[0]?.revid ?? ids[0] ?? null;
}

function anchorFromMetas(host: CleanupHost, job: PageJob): number | null {
  let best: { revid: number; timestamp: string } | null = null;
  for (const revid of job.taintedRevids) {
    const timestamp = host.session.metas[String(revid)]?.timestamp ?? "";
    if (!timestamp) continue;
    if (!best || timestamp < best.timestamp) best = { revid, timestamp };
  }
  return best?.revid ?? job.taintedRevids[0] ?? null;
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function note(text: string): Explanation {
  return {
    action: "warn-unknown-revid",
    start: [0, 0],
    end: [0, 0],
    details: [text],
  };
}
