import type { Revision } from "../scrubber/types.ts";
import { toolsForWiki, type AutoTool, type Contrib } from "./filters.ts";
import type { FilterConfig } from "./types.ts";

export class WikiError extends Error {}

export class EditConflict extends WikiError {}

let cachedTools: { server: string; tools: AutoTool[] } | null = null;

export function wikiApi(): MwApi {
  return new mw.Api();
}

export async function fetchAutoTools(serverName: string): Promise<AutoTool[]> {
  if (cachedTools?.server === serverName) return cachedTools.tools;
  const url = `https://meta.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: "MediaWiki:XTools-AutoEdits.json",
    rvprop: "content",
    rvslots: "main",
    format: "json",
    formatversion: "2",
    origin: "*",
  })}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new WikiError(
      `Could not load autoedits list (HTTP ${response.status})`,
    );
  }
  const data = (await response.json()) as Record<string, any>;
  assertOk(data);
  const content = pageList(data)[0]?.revisions?.[0]?.slots?.main?.content;
  const parsed: unknown =
    typeof content === "string" ? JSON.parse(content) : {};
  const tools = toolsForWiki(parsed, serverName);
  cachedTools = { server: serverName, tools };
  return tools;
}

export async function fetchContributions(
  user: string,
  config: FilterConfig,
  onProgress: (count: number) => void,
): Promise<Contrib[]> {
  const namespaces = config.namespaces ?? [null];
  const contribs: Contrib[] = [];
  for (const ns of namespaces) {
    let uccontinue: string | undefined;
    do {
      const data = await wikiApi().get(
        cleanParams({
          action: "query",
          list: "usercontribs",
          ucuser: user,
          ucprop: "ids|title|timestamp|comment|sizediff|tags|flags|size",
          uclimit: "500",
          ucstart: config.before ?? undefined,
          ucend: config.after ?? undefined,
          ucnamespace: ns == null ? undefined : String(ns),
          uccontinue,
          format: "json",
          formatversion: "2",
        }),
      );
      assertOk(data);
      const batch = (data.query?.usercontribs ?? []) as Record<string, any>[];
      for (const row of batch) contribs.push(asContrib(row));
      uccontinue = data.continue?.uccontinue as string | undefined;
      onProgress(contribs.length);
    } while (uccontinue);
  }
  return contribs;
}

/** Revisions from `behind` before `oldestRevid` through the latest revision. */
export async function fetchHistory(
  title: string,
  oldestRevid: number,
  behind = 50,
): Promise<Revision[]> {
  const byId = new Map<number, Revision>();
  await collectRevisions(
    title,
    { rvdir: "older", rvstartid: String(oldestRevid) },
    behind + 1,
    byId,
  );
  await collectRevisions(
    title,
    { rvdir: "newer", rvstartid: String(oldestRevid) },
    Number.POSITIVE_INFINITY,
    byId,
  );
  return [...byId.values()].sort(
    (a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.revid - b.revid,
  );
}

async function collectRevisions(
  title: string,
  direction: { rvdir: string; rvstartid: string },
  limit: number,
  into: Map<number, Revision>,
): Promise<void> {
  let rvcontinue: string | undefined;
  while (into.size < limit) {
    const data = await wikiApi().get(
      cleanParams({
        action: "query",
        prop: "revisions",
        titles: title,
        rvprop: "ids|timestamp|user|comment|flags|tags|content",
        rvslots: "main",
        rvlimit: "max",
        rvcontinue,
        format: "json",
        formatversion: "2",
        ...direction,
      }),
    );
    assertOk(data);
    const page = pageList(data)[0];
    let added = 0;
    for (const rev of (page?.revisions ?? []) as Record<string, any>[]) {
      if (typeof rev.revid !== "number" || into.has(rev.revid)) continue;
      into.set(rev.revid, {
        revid: rev.revid,
        timestamp:
          typeof rev.timestamp === "string" ? rev.timestamp : undefined,
        user: typeof rev.user === "string" ? rev.user : undefined,
        comment: typeof rev.comment === "string" ? rev.comment : undefined,
        bot: rev.bot === true,
        tags: Array.isArray(rev.tags)
          ? rev.tags.filter((tag: unknown): tag is string => typeof tag === "string")
          : undefined,
        content: slotContent(rev),
      });
      added += 1;
      if (into.size >= limit) return;
    }
    rvcontinue = data.continue?.rvcontinue as string | undefined;
    if (!rvcontinue || added === 0) return;
  }
}

export async function latestRevision(
  title: string,
): Promise<{ revid: number; content: string }> {
  const data = await wikiApi().get({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "ids|content",
    rvslots: "main",
    rvlimit: "1",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const rev = pageList(data)[0]?.revisions?.[0] as
    | Record<string, any>
    | undefined;
  if (!rev || typeof rev.revid !== "number") {
    throw new WikiError(`Could not read ${title}`);
  }
  return { revid: rev.revid, content: slotContent(rev) ?? "" };
}

export async function latestRevisionId(title: string): Promise<number> {
  const data = await wikiApi().get({
    action: "query",
    prop: "revisions",
    titles: title,
    rvprop: "ids",
    rvlimit: "1",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const rev = pageList(data)[0]?.revisions?.[0] as
    | Record<string, any>
    | undefined;
  if (!rev || typeof rev.revid !== "number") {
    throw new WikiError(`Could not read ${title}`);
  }
  return rev.revid;
}

export async function readPage(
  title: string,
): Promise<{ revid: number; text: string }> {
  const latest = await latestRevision(title);
  return { revid: latest.revid, text: latest.content };
}

export async function pageIdOf(title: string): Promise<number | null> {
  const data = await wikiApi().get({
    action: "query",
    titles: title,
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const pageid = pageList(data)[0]?.pageid;
  return typeof pageid === "number" ? pageid : null;
}

export async function userEditorKeys(user: string): Promise<Set<string>> {
  const data = await wikiApi().get({
    action: "query",
    list: "users",
    ususers: user,
    usprop: "userid",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const userid = data.query?.users?.[0]?.userid;
  if (typeof userid === "number" && userid > 0)
    return new Set([String(userid)]);
  return new Set([`0|${user}`]);
}

export async function expandWikitext(
  title: string,
  text: string,
): Promise<string> {
  const data = await wikiApi().get({
    action: "expandtemplates",
    title,
    text,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const wikitext = data.expandtemplates?.wikitext;
  if (typeof wikitext !== "string" || wikitext.includes("{{subst:")) {
    throw new WikiError("Could not expand the substituted template");
  }
  return wikitext;
}

export async function previewWikitext(
  title: string,
  text: string,
): Promise<string> {
  const data = await wikiApi().post({
    action: "parse",
    title,
    text,
    prop: "text",
    preview: "1",
    disableeditsection: "1",
    contentmodel: "wikitext",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const html = data.parse?.text;
  if (typeof html !== "string") throw new WikiError("Could not preview the edit");
  return html;
}

/** Titles of pages this user created. Uses `ucshow=new`, one list, not one query per title. */
export async function titlesCreatedBy(
  user: string,
  namespaces: readonly number[] | null,
): Promise<Set<string>> {
  const created = new Set<string>();
  let uccontinue: string | undefined;
  do {
    const data = await wikiApi().get(
      cleanParams({
        action: "query",
        list: "usercontribs",
        ucuser: user,
        ucshow: "new",
        ucprop: "title",
        uclimit: "500",
        ucnamespace: namespaces?.length ? namespaces.join("|") : undefined,
        uccontinue,
        format: "json",
        formatversion: "2",
      }),
    );
    assertOk(data);
    const batch = (data.query?.usercontribs ?? []) as Record<string, any>[];
    for (const row of batch) {
      if (typeof row.title === "string") created.add(row.title);
    }
    uccontinue = data.continue?.uccontinue as string | undefined;
  } while (uccontinue);
  return created;
}

export async function hasCategory(
  title: string,
  category: string,
): Promise<boolean> {
  const data = await wikiApi().get({
    action: "query",
    prop: "categories",
    titles: title,
    clcategories: category,
    cllimit: "1",
    format: "json",
    formatversion: "2",
  });
  assertOk(data);
  const categories = pageList(data)[0]?.categories;
  return Array.isArray(categories) && categories.length > 0;
}

export async function savePage(
  title: string,
  text: string,
  summary: string,
  baserevid: number,
): Promise<number> {
  const data = await postEdit({
    action: "edit",
    title,
    text,
    summary,
    baserevid: String(baserevid),
    format: "json",
    formatversion: "2",
    maxlag: "5",
  });
  if (data.error?.code === "editconflict") {
    throw new EditConflict(data.error.info ?? "Edit conflict");
  }
  assertOk(data);
  const revid = data.edit?.newrevid;
  if (typeof revid !== "number" || data.edit?.result !== "Success") {
    throw new WikiError(`Edit to ${title} did not save`);
  }
  return revid;
}

export async function undoRevision(
  title: string,
  revid: number,
  summary: string,
): Promise<number> {
  const data = await postEdit({
    action: "edit",
    title,
    undo: String(revid),
    summary,
    format: "json",
    formatversion: "2",
    maxlag: "5",
  });
  assertOk(data);
  const saved = data.edit?.newrevid;
  if (typeof saved !== "number") throw new WikiError(`Could not undo ${revid}`);
  return saved;
}

export async function revisionIdsBetween(
  title: string,
  startRevid: number,
  endRevid: number,
): Promise<number[]> {
  const ids = new Set<number>([startRevid, endRevid]);
  let rvcontinue: string | undefined;
  do {
    const data = await wikiApi().get(
      cleanParams({
        action: "query",
        prop: "revisions",
        titles: title,
        rvprop: "ids",
        rvdir: "newer",
        rvstartid: String(startRevid),
        rvendid: String(endRevid),
        rvlimit: "max",
        rvcontinue,
        format: "json",
        formatversion: "2",
      }),
    );
    assertOk(data);
    for (const rev of (pageList(data)[0]?.revisions ?? []) as Record<
      string,
      any
    >[]) {
      if (typeof rev.revid === "number") ids.add(rev.revid);
    }
    rvcontinue = data.continue?.rvcontinue as string | undefined;
  } while (rvcontinue);
  return [...ids].sort((a, b) => a - b);
}

export async function hideRevisionContents(
  title: string,
  ids: readonly number[],
  reason: string,
): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await postEdit({
      action: "revisiondelete",
      type: "revision",
      target: title,
      ids: chunk.join("|"),
      hide: "content",
      reason,
      format: "json",
      formatversion: "2",
    });
    assertOk(data);
  }
}

async function postEdit(
  params: Record<string, string>,
): Promise<Record<string, any>> {
  const api = wikiApi();
  if (api.postWithEditToken) return api.postWithEditToken(params);
  if (api.postWithToken) return api.postWithToken("csrf", params);
  const token = await api.get({
    action: "query",
    meta: "tokens",
    type: "csrf",
    format: "json",
    formatversion: "2",
  });
  const csrf = token.query?.tokens?.csrftoken as string | undefined;
  if (!csrf) throw new WikiError("No edit token");
  return api.post({ ...params, token: csrf });
}

function asContrib(row: Record<string, any>): Contrib {
  return {
    revid: Number(row.revid),
    title: String(row.title ?? ""),
    timestamp: String(row.timestamp ?? ""),
    comment: String(row.comment ?? ""),
    sizediff: Number(row.sizediff ?? 0),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    ns: Number(row.ns ?? 0),
    isNew: row.new === true || row.parentid === 0,
    pageid: typeof row.pageid === "number" ? row.pageid : null,
  };
}

function pageList(data: Record<string, any>): Record<string, any>[] {
  const pages = data.query?.pages;
  if (Array.isArray(pages)) return pages;
  if (pages && typeof pages === "object") return Object.values(pages);
  return [];
}

function slotContent(rev: Record<string, any>): string | null {
  const slot = rev.slots?.main;
  if (!slot || typeof slot !== "object") {
    return typeof rev["*"] === "string" ? rev["*"] : null;
  }
  const text = slot.content ?? slot["*"];
  return typeof text === "string" ? text : null;
}

function assertOk(data: Record<string, any>): void {
  if (data.error) {
    throw new WikiError(data.error.info ?? data.error.code ?? "Wiki API error");
  }
}

function cleanParams(
  params: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") out[key] = value;
  }
  return out;
}
