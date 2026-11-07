import {
  citeRevision,
  compactHistory,
  hasRuleMachinery,
  legalNames,
  parseRevision,
  resolveParam,
  weightModel,
} from "./rules.ts";
import type {
  ParsedRevision,
  SnippetComment,
  TemplateHistory,
  TemplateRevision,
} from "./types.ts";
import {
  findTemplates,
  isRewritableTemplateName,
  removalRange,
  templatePageTitle,
} from "./wikitext.ts";

export type {
  ParsedRevision,
  SnippetComment,
  TemplateHistory,
  TemplateRevision,
} from "./types.ts";

export interface RefreshOptions {
  apiRoot?: string;
  /** Test/offline injector: full raw histories. Converted and collapsed once. */
  fetchRevisions?: (title: string) => Promise<TemplateRevision[]>;
  now?: number;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

interface LatestRevision {
  title: string;
  revid: number;
  timestamp: string;
  content: string;
}

interface CacheEntry {
  history: TemplateHistory;
  used: number;
}

const DEFAULT_API = "https://en.wikipedia.org/w/api.php";
const TITLE_BATCH = 50;
const HISTORY_CONCURRENCY = 4;
const CACHE_LIMIT = 64;
const STORAGE_PREFIX = "emf-dep-v4:";
/** Maximum backwards revisions to examine for a single template. */
const MAX_BACKWARDS_REVISIONS = 500;

const historyCache = new Map<string, CacheEntry>();
let cacheClock = 0;
const inflight = new Map<string, Promise<TemplateHistory>>();

export function clearTemplateRevisionCache(): void {
  historyCache.clear();
  inflight.clear();
  cacheClock = 0;
  clearStorageCache();
}

export async function refreshDeprecatedParameters(
  text: string,
  comments: SnippetComment[],
  snippetTimestamp: string,
  fetchRevisions?: (title: string) => Promise<TemplateRevision[]>,
): Promise<{ text: string; comments: SnippetComment[] }>;
export async function refreshDeprecatedParameters(
  text: string,
  comments: SnippetComment[],
  snippetTimestamp: string,
  options?: RefreshOptions,
): Promise<{ text: string; comments: SnippetComment[] }>;
export async function refreshDeprecatedParameters(
  text: string,
  comments: SnippetComment[],
  snippetTimestamp: string,
  fetchOrOptions?:
    | ((title: string) => Promise<TemplateRevision[]>)
    | RefreshOptions,
): Promise<{ text: string; comments: SnippetComment[] }> {
  const snippetMs = Date.parse(snippetTimestamp);
  if (!Number.isFinite(snippetMs)) throw new Error("Invalid snippet timestamp");
  const options: RefreshOptions =
    typeof fetchOrOptions === "function"
      ? { fetchRevisions: fetchOrOptions }
      : (fetchOrOptions ?? {});
  const now = options.now ?? Date.now();
  const apiRoot = options.apiRoot ?? DEFAULT_API;
  const templates = findTemplates(text).filter((template) =>
    isRewritableTemplateName(template.name),
  );

  // Index which parameter names are actually used by each template on the page.
  const invokedParamsByTitle = new Map<string, Set<string>>();
  for (const template of templates) {
    const title = templatePageTitle(template.name);
    const set = invokedParamsByTitle.get(title) ?? new Set<string>();
    for (const param of template.params) {
      if (param.name) set.add(param.name);
    }
    invokedParamsByTitle.set(title, set);
  }

  const names = [...new Set(templates.map((template) => template.name))];
  const titles = names.map((name) => templatePageTitle(name));
  const byTitle = await loadHistories(
    titles,
    apiRoot,
    snippetMs,
    invokedParamsByTitle,
    options.fetchRevisions,
  );
  const histories = new Map<string, TemplateHistory>();
  for (let i = 0; i < names.length; i++) {
    const title = titles[i]!;
    histories.set(
      names[i]!,
      byTitle.get(title) ?? {
        title,
        tipRevid: null,
        legal: new Set(),
        revisions: [],
      },
    );
  }

  const edits: Edit[] = [];
  const notes: Array<{ start: number; end: number; text: string }> = [];
  const modelCache = new Map<string, ReturnType<typeof weightModel>>();
  for (let i = 0; i < templates.length; i++) {
    if (i > 0 && i % 25 === 0) await yieldToBrowser();
    const template = templates[i]!;
    let model = modelCache.get(template.name);
    if (!model) {
      model = weightModel(
        histories.get(template.name) ?? {
          title: template.name,
          tipRevid: null,
          legal: new Set(),
          revisions: [],
        },
        snippetMs,
        now,
      );
      modelCache.set(template.name, model);
    }
    const changes: Array<[string, string]> = [];
    const pairs: string[] = [];
    for (const param of template.params) {
      const resolved = resolveParam(model, param.name);
      if (!resolved || resolved.to === param.name) continue;
      changes.push([param.name, resolved.to]);
      pairs.push(...resolved.pairs);
      if (resolved.to === "")
        edits.push({ ...removalRange(text, param), replacement: "" });
      else
        edits.push({
          start: param.keyStart,
          end: param.keyEnd,
          replacement: resolved.to,
        });
    }
    if (changes.length === 0) continue;
    const cited = citeRevision(model, pairs);
    if (!cited) continue;
    notes.push({
      start: template.start,
      end: template.end,
      text: `revid:${cited.revid} timestamp:${cited.timestamp} template:${JSON.stringify(template.name)} ${JSON.stringify(changes)}`,
    });
  }

  const kept = pruneOverlaps(edits);
  const rewritten = applyEdits(text, kept);
  const beforeStarts = lineStarts(text);
  const afterStarts = lineStarts(rewritten);
  const shifted = comments.flatMap((comment) =>
    mapComment(comment, text, kept, beforeStarts, afterStarts),
  );
  const attached = notes.map((note) =>
    toComment(
      mapOffset(note.start, kept),
      mapOffset(note.end, kept),
      afterStarts,
      note.text,
    ),
  );
  return {
    text: rewritten,
    comments: [...shifted, ...attached].sort(compareComments),
  };
}

async function loadHistories(
  titles: readonly string[],
  apiRoot: string,
  snippetMs: number,
  invokedParamsByTitle: ReadonlyMap<string, ReadonlySet<string>>,
  fetchRevisions?: (title: string) => Promise<TemplateRevision[]>,
): Promise<Map<string, TemplateHistory>> {
  const out = new Map<string, TemplateHistory>();
  if (titles.length === 0) return out;

  if (fetchRevisions) {
    await mapPool(titles, HISTORY_CONCURRENCY, async (title) => {
      const raw = await fetchRevisions(title);
      out.set(title, compactHistory(title, raw));
    });
    return out;
  }

  // 1. Fetch latest revision of all templates in a single batch.
  const latestByTitle = await fetchLatestBatch(titles, apiRoot);
  const needHistory: Array<{ title: string; latest: LatestRevision }> = [];

  for (const title of titles) {
    const latest = latestByTitle.get(title);
    if (!latest) {
      const empty: TemplateHistory = {
        title,
        tipRevid: null,
        legal: new Set(),
        revisions: [],
      };
      cacheSet(apiRoot, title, empty);
      out.set(title, empty);
      continue;
    }

    // 2. Check persistent/in-memory cache for valid entry matching live tip.
    const cached = cacheGet(apiRoot, title);
    if (cached && cached.tipRevid === latest.revid) {
      out.set(title, cached);
      continue;
    }

    // 3. PARAMETER ELIGIBILITY FILTER:
    // If all parameters in the restored wikitext are already recognized by the
    // template's current legal names, and the tip has no active deprecation rules,
    // none of the parameters on the page can be deprecated. Skip history!
    const legal = legalNames(latest.content);
    const tipRules = parseRevision(latest.content);
    const hasRules = hasRuleMachinery(tipRules);
    const invoked = invokedParamsByTitle.get(title);
    const hasUnknownParam =
      invoked != null && [...invoked].some((p) => !legal.has(p));

    if (!hasUnknownParam && !hasRules) {
      const clean: TemplateHistory = {
        title: latest.title,
        tipRevid: latest.revid,
        legal,
        revisions: [],
      };
      cacheSet(apiRoot, title, clean);
      out.set(title, clean);
      continue;
    }

    // Template has unknown parameters or active deprecation rules: fetch history.
    cacheDelete(apiRoot, title);
    needHistory.push({ title, latest });
  }

  await mapPool(needHistory, HISTORY_CONCURRENCY, async ({ title, latest }) => {
    const history = await loadTemplateHistory(title, apiRoot, latest, snippetMs);
    out.set(title, history);
  });
  return out;
}

async function loadTemplateHistory(
  title: string,
  apiRoot: string,
  latest: LatestRevision,
  snippetMs: number,
): Promise<TemplateHistory> {
  const key = cacheKey(apiRoot, title);
  const hit = historyCache.get(key);
  if (hit && hit.history.tipRevid === latest.revid) {
    hit.used = ++cacheClock;
    return hit.history;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const load = (async () => {
    try {
      const history = await streamCompactHistory(
        title,
        apiRoot,
        latest,
        snippetMs,
      );
      cacheSet(apiRoot, title, history);
      return history;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, load);
  return load;
}

/**
 * Walk history backwards from tip (rvdir=older).
 * Recent deprecations are found in the first batch. We stop once we have
 * covered the snippetTimestamp era or hit MAX_BACKWARDS_REVISIONS.
 */
async function streamCompactHistory(
  title: string,
  apiRoot: string,
  latest: LatestRevision,
  snippetMs: number,
): Promise<TemplateHistory> {
  const rawRevisions: TemplateRevision[] = [
    {
      revid: latest.revid,
      timestamp: latest.timestamp,
      content: latest.content,
    },
  ];

  let resolvedTitle = latest.title || title;
  let rvcontinue: string | undefined;
  let rawCount = 1;

  for (let page = 0; page < 20; page++) {
    const params = queryParams({
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      rvlimit: "max",
      rvdir: "older",
      rvstartid: String(latest.revid),
      titles: title,
    });
    if (rvcontinue) params.set("rvcontinue", rvcontinue);

    const data = await apiGet(apiRoot, params);
    const pageInfo = firstPage(data);
    if (!pageInfo || pageInfo.missing === true || pageInfo.invalid === true) {
      break;
    }
    if (typeof pageInfo.title === "string") resolvedTitle = pageInfo.title;

    const revs = Array.isArray(pageInfo.revisions) ? pageInfo.revisions : [];
    let pastSnippet = false;
    for (const rev of revs) {
      if (typeof rev.revid !== "number" || typeof rev.timestamp !== "string") {
        continue;
      }
      if (rev.revid === latest.revid) continue; // Already added as latest
      rawCount += 1;
      rawRevisions.push({
        revid: rev.revid,
        timestamp: rev.timestamp,
        content: revisionContent(rev),
      });

      const revMs = Date.parse(rev.timestamp);
      if (Number.isFinite(revMs) && revMs < snippetMs) {
        pastSnippet = true;
      }
      if (rawCount >= MAX_BACKWARDS_REVISIONS) break;
    }

    await yieldToBrowser();
    rvcontinue =
      typeof data.continue?.rvcontinue === "string"
        ? data.continue.rvcontinue
        : undefined;

    // Stop if we reached before the snippetTimestamp or exhausted history.
    if (!rvcontinue || pastSnippet || rawCount >= MAX_BACKWARDS_REVISIONS) {
      break;
    }
  }

  // Sort chronological (oldest to newest) and compact.
  rawRevisions.sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.revid - b.revid,
  );
  const compact = compactHistory(resolvedTitle, rawRevisions);
  return {
    ...compact,
    tipRevid: latest.revid,
    legal: legalNames(latest.content),
  };
}

async function fetchLatestBatch(
  titles: readonly string[],
  apiRoot: string,
): Promise<Map<string, LatestRevision>> {
  const out = new Map<string, LatestRevision>();
  for (let i = 0; i < titles.length; i += TITLE_BATCH) {
    const batch = titles.slice(i, i + TITLE_BATCH);
    const data = await apiGet(
      apiRoot,
      queryParams({
        prop: "revisions",
        rvprop: "ids|timestamp|content",
        rvslots: "main",
        titles: batch.join("|"),
      }),
    );
    collectRevisions(data, batch, out);
    await yieldToBrowser();
  }
  return out;
}

function queryParams(extra: Record<string, string>): URLSearchParams {
  return new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    ...extra,
  });
}

function collectRevisions(
  data: ApiResponse,
  wanted: readonly string[],
  out: Map<string, LatestRevision>,
): void {
  const normalized = redirectMap(data);
  const byResolved = new Map<string, LatestRevision>();
  for (const page of pageList(data)) {
    const rev = pageRevision(page);
    if (rev) byResolved.set(rev.title, rev);
  }
  for (const title of wanted) {
    const hit =
      byResolved.get(resolveTitle(title, normalized)) ??
      byResolved.get(title);
    if (hit) out.set(title, hit);
  }
}

function pageRevision(page: ApiPage): LatestRevision | null {
  if (page.missing === true || page.invalid === true) return null;
  const rev = Array.isArray(page.revisions) ? page.revisions[0] : undefined;
  if (
    typeof page.title !== "string" ||
    typeof rev?.revid !== "number" ||
    typeof rev.timestamp !== "string"
  ) {
    return null;
  }
  return {
    title: page.title,
    revid: rev.revid,
    timestamp: rev.timestamp,
    content: revisionContent(rev),
  };
}

function redirectMap(data: ApiResponse): Map<string, string> {
  const normalized = new Map<string, string>();
  if (Array.isArray(data.query?.normalized)) {
    for (const row of data.query.normalized) {
      if (typeof row?.from === "string" && typeof row?.to === "string") {
        normalized.set(row.from, row.to);
      }
    }
  }
  if (Array.isArray(data.query?.redirects)) {
    for (const row of data.query.redirects) {
      if (typeof row?.from === "string" && typeof row?.to === "string") {
        normalized.set(row.from, row.to);
      }
    }
  }
  return normalized;
}

function resolveTitle(wanted: string, normalized: Map<string, string>): string {
  let cursor = wanted;
  const seen = new Set<string>();
  while (normalized.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    cursor = normalized.get(cursor)!;
  }
  return cursor;
}

async function apiGet(
  apiRoot: string,
  params: URLSearchParams,
): Promise<ApiResponse> {
  const joiner = apiRoot.includes("?") ? "&" : "?";
  const response = await fetch(`${apiRoot}${joiner}${params}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch template revisions (HTTP ${response.status})`,
    );
  }
  const data = (await response.json()) as ApiResponse;
  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Wiki API error");
  }
  return data;
}

function cacheKey(apiRoot: string, title: string): string {
  return `${apiRoot}\0${title}`;
}

function cacheGet(apiRoot: string, title: string): TemplateHistory | null {
  const key = cacheKey(apiRoot, title);
  const mem = historyCache.get(key);
  if (mem) {
    mem.used = ++cacheClock;
    return mem.history;
  }
  const persistent = readStorageCache(key);
  if (persistent) {
    historyCache.set(key, { history: persistent, used: ++cacheClock });
    return persistent;
  }
  return null;
}

function cacheDelete(apiRoot: string, title: string): void {
  const key = cacheKey(apiRoot, title);
  historyCache.delete(key);
  removeStorageCache(key);
}

function cacheSet(
  apiRoot: string,
  title: string,
  history: TemplateHistory,
): void {
  const key = cacheKey(apiRoot, title);
  historyCache.set(key, { history, used: ++cacheClock });
  writeStorageCache(key, history);

  while (historyCache.size > CACHE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestUsed = Infinity;
    for (const [k, entry] of historyCache) {
      if (entry.used < oldestUsed) {
        oldestUsed = entry.used;
        oldestKey = k;
      }
    }
    if (oldestKey == null) break;
    historyCache.delete(oldestKey);
  }
}

interface StoredHistory {
  title: string;
  tipRevid: number | null;
  legal: string[];
  revisions: ParsedRevision[];
}

function readStorageCache(key: string): TemplateHistory | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredHistory;
    if (!parsed || typeof parsed.title !== "string" || !Array.isArray(parsed.revisions)) {
      return null;
    }
    return {
      title: parsed.title,
      tipRevid: parsed.tipRevid ?? null,
      legal: new Set(parsed.legal ?? []),
      revisions: parsed.revisions,
    };
  } catch {
    return null;
  }
}

function writeStorageCache(key: string, history: TemplateHistory): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const stored: StoredHistory = {
      title: history.title,
      tipRevid: history.tipRevid,
      legal: [...history.legal],
      revisions: [...history.revisions],
    };
    storage.setItem(STORAGE_PREFIX + key, JSON.stringify(stored));
  } catch {
    // Quota exceeded or private browsing mode - silently ignore.
  }
}

function removeStorageCache(key: string): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    storage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Ignore.
  }
}

function clearStorageCache(): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) storage.removeItem(k);
  } catch {
    // Ignore.
  }
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  };
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => run()));
}

function pruneOverlaps(edits: Edit[]): Edit[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Edit[] = [];
  let covered = -1;
  for (const edit of sorted) {
    if (edit.start < covered) continue;
    kept.push(edit);
    covered = Math.max(covered, edit.end);
  }
  return kept;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of ordered)
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  return out;
}

function mapComment(
  comment: SnippetComment,
  before: string,
  edits: readonly Edit[],
  beforeStarts: readonly number[],
  afterStarts: readonly number[],
): SnippetComment[] {
  const start = fromLineCh(
    comment.startLine,
    comment.startCh,
    beforeStarts,
    before.length,
  );
  const end = fromLineCh(
    comment.endLine,
    comment.endCh,
    beforeStarts,
    before.length,
  );
  if (
    edits.some(
      (edit) =>
        edit.replacement === "" && edit.start <= start && end <= edit.end,
    )
  )
    return [];
  const mappedStart = mapOffset(start, edits);
  const mappedEnd = mapOffset(Math.max(end, start), edits);
  if (mappedEnd < mappedStart) return [];
  return [toComment(mappedStart, mappedEnd, afterStarts, comment.text)];
}

function mapOffset(offset: number, edits: readonly Edit[]): number {
  let shift = 0;
  for (const edit of edits) {
    if (edit.end <= offset)
      shift += edit.replacement.length - (edit.end - edit.start);
    else if (edit.start < offset) return edit.start + shift;
    else break;
  }
  return offset + shift;
}

function toComment(
  start: number,
  end: number,
  starts: readonly number[],
  body: string,
): SnippetComment {
  const from = toLineCh(start, starts);
  const to = toLineCh(end, starts);
  return {
    startLine: from.line,
    startCh: from.ch,
    endLine: to.line,
    endCh: to.ch,
    text: body,
  };
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function toLineCh(
  offset: number,
  starts: readonly number[],
): { line: number; ch: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, ch: offset - (starts[lo] ?? 0) };
}

function fromLineCh(
  line: number,
  ch: number,
  starts: readonly number[],
  length: number,
): number {
  const start = starts[line - 1] ?? length;
  return start + ch;
}

function compareComments(a: SnippetComment, b: SnippetComment): number {
  return (
    a.startLine - b.startLine ||
    a.startCh - b.startCh ||
    a.endLine - b.endLine ||
    a.endCh - b.endCh
  );
}

function pageList(data: ApiResponse): ApiPage[] {
  const pages = data.query?.pages;
  if (Array.isArray(pages)) return pages;
  if (pages && typeof pages === "object") return Object.values(pages);
  return [];
}

function firstPage(data: ApiResponse): ApiPage | undefined {
  return pageList(data)[0];
}

function revisionContent(rev: ApiRevision): string {
  const slot = rev.slots?.main;
  if (slot) {
    const text = slot["*"] ?? slot.content;
    if (typeof text === "string") return text;
  }
  return typeof rev["*"] === "string" ? rev["*"] : "";
}

async function yieldToBrowser(): Promise<void> {
  const scheduler = (
    globalThis as { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler;
  if (typeof scheduler?.yield === "function") {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface ApiRevision {
  revid?: number;
  timestamp?: string;
  slots?: { main?: { "*"?: string; content?: string } };
  "*"?: string;
}

interface ApiPage {
  title?: string;
  missing?: unknown;
  invalid?: unknown;
  revisions?: ApiRevision[];
}

interface ApiResponse {
  error?: { code?: string; info?: string };
  continue?: { rvcontinue?: string };
  query?: {
    pages?: ApiPage[] | Record<string, ApiPage>;
    normalized?: Array<{ from?: string; to?: string }>;
    redirects?: Array<{ from?: string; to?: string }>;
  };
}
