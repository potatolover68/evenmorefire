import { refreshDeprecatedParameters } from "../deprecated/refresh.ts";
import { markArticleCompleted } from "../userscript/aic.ts";
import { restoreSummary, trackingSummary } from "./summary.ts";

type Json = Record<string, unknown>;

/** A rejected `mw.Api` call. `code` is the API error code, e.g. `editconflict`. */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export interface RestoreRequest {
  revid: number;
  /** Additional edit summary; "" for none. */
  extra: string;
  /** Tracking page to mark completed after the restore. "" to leave it alone. */
  tracking: string;
}

export type TrackingResult =
  | { status: "marked"; page: string }
  /** No row for this page that was not already completed. */
  | { status: "unchanged"; page: string }
  | { status: "failed"; page: string; error: string };

export interface RestoreResult {
  /** False when the page already matched, so the save was a null edit. */
  edited: boolean;
  /** True when deprecated template parameters were rewritten. */
  refreshed: boolean;
  tracking: TrackingResult | null;
}

interface TargetRevision {
  /** null when the username is hidden. */
  user: string | null;
  timestamp: string;
  content: string;
  model: string;
}

/**
 * Restore the current page to `revid`.
 */
export async function restoreRevision(
  request: RestoreRequest,
): Promise<RestoreResult> {
  const api = new mw.Api();
  const target = await fetchRevision(api, request.revid);
  let text = target.content;
  if (target.model === "wikitext") {
    const refreshed = await refreshDeprecatedParameters(
      text,
      [],
      target.timestamp,
      { apiRoot: mw.util.wikiScript("api") },
    );
    text = refreshed.text;
  }
  const edited = await saveRestore(
    api,
    text,
    restoreSummary(request.revid, target.user, request.extra),
  );
  const page = request.tracking.trim();
  return {
    edited,
    refreshed: text !== target.content,
    tracking: page ? await updateTracking(api, page, currentTitle()) : null,
  };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchRevision(
  api: mw.Api,
  revid: number,
): Promise<TargetRevision> {
  const data = await call(
    api,
    api.get({
      action: "query",
      prop: "revisions",
      revids: revid,
      rvprop: ["user", "timestamp", "content", "contentmodel"],
      rvslots: "main",
      formatversion: "2",
    }),
  );
  const rev = firstRecord(firstRecord(record(data.query)?.pages)?.revisions);
  if (!rev) throw new Error(`Could not read revision ${revid}`);
  const slot = record(record(rev.slots)?.main);
  // Admins get hidden text back along with the flag; never restore it.
  if (rev.texthidden === true || slot?.texthidden === true) {
    throw new Error(`The text of revision ${revid} is hidden`);
  }
  const content = slot?.content;
  const timestamp = rev.timestamp;
  if (typeof content !== "string" || typeof timestamp !== "string") {
    throw new Error(`Could not read revision ${revid}`);
  }
  // Admins also get hidden usernames back; keep them out of the summary.
  const user =
    rev.userhidden !== true && typeof rev.user === "string" ? rev.user : null;
  const model =
    typeof slot?.contentmodel === "string"
      ? slot.contentmodel
      : mw.config.get("wgPageContentModel");
  return { user, timestamp, content, model };
}

/** Returns false for a null edit. */
async function saveRestore(
  api: mw.Api,
  text: string,
  summary: string,
): Promise<boolean> {
  const data = await call(
    api,
    api.postWithEditToken({
      action: "edit",
      pageid: mw.config.get("wgArticleId"),
      text,
      summary,
      baserevid: mw.config.get("wgCurRevisionId"),
      nocreate: true,
      formatversion: "2",
    }),
  );
  return savedEdit(data, currentTitle());
}

/** Same flow as `updateTracking` in userscript/cleanup.ts. */
async function updateTracking(
  api: mw.Api,
  page: string,
  title: string,
): Promise<TrackingResult> {
  try {
    for (let attempt = 0; ; attempt++) {
      const current = await readPage(api, page);
      const next = markArticleCompleted(current.text, title, "completed");
      if (next == null) return { status: "unchanged", page: current.title };
      try {
        const data = await call(
          api,
          api.postWithEditToken({
            action: "edit",
            title: current.title,
            text: next,
            summary: trackingSummary(title),
            baserevid: current.revid,
            nocreate: true,
            formatversion: "2",
          }),
        );
        savedEdit(data, current.title);
        return { status: "marked", page: current.title };
      } catch (error) {
        const conflict =
          error instanceof ApiError && error.code === "editconflict";
        if (!conflict || attempt > 0) throw error;
      }
    }
  } catch (error) {
    return { status: "failed", page, error: errorText(error) };
  }
}

/** The latest text of `page`, following redirects. */
async function readPage(
  api: mw.Api,
  page: string,
): Promise<{ title: string; revid: number; text: string }> {
  const data = await call(
    api,
    api.get({
      action: "query",
      prop: "revisions",
      titles: page,
      redirects: true,
      rvprop: ["ids", "content"],
      rvslots: "main",
      formatversion: "2",
    }),
  );
  const info = firstRecord(record(data.query)?.pages);
  if (!info || info.invalid === true) {
    throw new Error(`${page} is not a valid page title`);
  }
  if (info.missing === true) throw new Error(`${page} does not exist`);
  const rev = firstRecord(info.revisions);
  const revid = rev?.revid;
  const text = record(record(rev?.slots)?.main)?.content;
  if (typeof revid !== "number" || typeof text !== "string") {
    throw new Error(`Could not read ${page}`);
  }
  return { title: typeof info.title === "string" ? info.title : page, revid, text };
}

/** True for a new revision, false for a null edit. Throws when nothing saved. */
function savedEdit(data: Json, title: string): boolean {
  const edit = record(data.edit);
  if (edit?.result !== "Success") {
    throw new Error(`The edit to ${title} did not save`);
  }
  return edit.nochange !== true;
}

/** Await an `mw.Api` request, rejecting with an ApiError that keeps the code. */
function call(api: mw.Api, request: mw.Api.AbortablePromise): Promise<Json> {
  return new Promise((resolve, reject) => {
    request.then(
      (data: Json) => resolve(data),
      (code: string, data: unknown) =>
        reject(new ApiError(code, apiErrorText(api, code, data))),
    );
  });
}

function apiErrorText(api: mw.Api, code: string, data: unknown): string {
  const response = record(data);
  if (response) {
    try {
      const text = api.getErrorMessage(response).text().trim();
      if (text) return text;
    } catch {
      // Fall back to the bare error code.
    }
  }
  return code;
}

function currentTitle(): string {
  return mw.config.get("wgPageName").replace(/_/g, " ");
}

function record(value: unknown): Json | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

function firstRecord(value: unknown): Json | undefined {
  return Array.isArray(value) ? record(value[0]) : undefined;
}
