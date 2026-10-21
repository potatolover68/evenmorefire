import { citeRevision, resolveParam, weightModel } from "./rules.ts";
import type { SnippetComment, TemplateRevision } from "./types.ts";
import {
  findTemplates,
  isRewritableTemplateName,
  removalRange,
  templatePageTitle,
} from "./wikitext.ts";

export type { SnippetComment, TemplateRevision } from "./types.ts";

export interface RefreshOptions {
  apiRoot?: string;
  fetchRevisions?: (title: string) => Promise<TemplateRevision[]>;
  now?: number;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

const revisionCache = new Map<string, Promise<TemplateRevision[]>>();

export function clearTemplateRevisionCache(): void {
  revisionCache.clear();
}

export function wikipediaRevisionsFetcher(
  apiRoot = "https://en.wikipedia.org/w/api.php",
): (title: string) => Promise<TemplateRevision[]> {
  return (title) => fetchTemplateRevisions(title, apiRoot);
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
  const fetcher =
    options.fetchRevisions ?? wikipediaRevisionsFetcher(options.apiRoot);
  const now = options.now ?? Date.now();
  const templates = findTemplates(text).filter((template) =>
    isRewritableTemplateName(template.name),
  );
  const histories = new Map<string, TemplateRevision[]>();
  for (const name of new Set(templates.map((template) => template.name))) {
    histories.set(name, await fetcher(templatePageTitle(name)));
  }

  const edits: Edit[] = [];
  const notes: Array<{ start: number; end: number; text: string }> = [];
  for (const template of templates) {
    const history = histories.get(template.name) ?? [];
    const model = weightModel(history, snippetMs, now);
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
  const shifted = comments.flatMap((comment) =>
    mapComment(comment, text, rewritten, kept),
  );
  const attached = notes.map((note) =>
    toComment(
      mapOffset(note.start, kept),
      mapOffset(note.end, kept),
      rewritten,
      note.text,
    ),
  );
  return {
    text: rewritten,
    comments: [...shifted, ...attached].sort(compareComments),
  };
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
  after: string,
  edits: readonly Edit[],
): SnippetComment[] {
  const start = fromLineCh(comment.startLine, comment.startCh, before);
  const end = fromLineCh(comment.endLine, comment.endCh, before);
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
  return [toComment(mappedStart, mappedEnd, after, comment.text)];
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
  text: string,
  body: string,
): SnippetComment {
  const starts = lineStarts(text);
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

function fromLineCh(line: number, ch: number, text: string): number {
  const starts = lineStarts(text);
  const start = starts[line - 1] ?? text.length;
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

async function fetchTemplateRevisions(
  title: string,
  apiRoot: string,
): Promise<TemplateRevision[]> {
  const key = `${apiRoot}\0${title}`;
  const cached = revisionCache.get(key);
  if (cached) return cached;
  const pending = loadAllRevisions(title, apiRoot);
  revisionCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    revisionCache.delete(key);
    throw error;
  }
}

async function loadAllRevisions(
  title: string,
  apiRoot: string,
): Promise<TemplateRevision[]> {
  const collected: TemplateRevision[] = [];
  let rvcontinue: string | undefined;
  for (let page = 0; page < 500; page++) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      rvlimit: "50",
      rvdir: "newer",
      redirects: "1",
      titles: title,
    });
    if (rvcontinue) params.set("rvcontinue", rvcontinue);
    const response = await fetch(
      `${apiRoot}${apiRoot.includes("?") ? "&" : "?"}${params}`,
    );
    if (!response.ok)
      throw new Error(
        `Failed to fetch template revisions (HTTP ${response.status})`,
      );
    const data = (await response.json()) as ApiResponse;
    if (data.error)
      throw new Error(data.error.info ?? data.error.code ?? "Wiki API error");
    const pages = data.query?.pages;
    if (pages) {
      for (const entry of Object.values(pages)) {
        if (entry.missing !== undefined || entry.invalid !== undefined)
          return [];
        for (const rev of entry.revisions ?? []) {
          if (
            typeof rev.revid !== "number" ||
            typeof rev.timestamp !== "string"
          )
            continue;
          collected.push({
            revid: rev.revid,
            timestamp: rev.timestamp,
            content: revisionContent(rev),
          });
        }
      }
    }
    rvcontinue = data.continue?.rvcontinue;
    if (!rvcontinue) break;
  }
  return collected;
}

interface ApiRevision {
  revid?: number;
  timestamp?: string;
  slots?: { main?: { "*"?: string; content?: string } };
  "*"?: string;
}

interface ApiResponse {
  error?: { code?: string; info?: string };
  continue?: { rvcontinue?: string };
  query?: {
    pages?: Record<
      string,
      { missing?: unknown; invalid?: unknown; revisions?: ApiRevision[] }
    >;
  };
}

function revisionContent(rev: ApiRevision): string {
  const slot = rev.slots?.main;
  if (slot) {
    const text = slot["*"] ?? slot.content;
    if (typeof text === "string") return text;
  }
  return typeof rev["*"] === "string" ? rev["*"] : "";
}
