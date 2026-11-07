import { clickAction, linkLabel, linkTooltip } from "./link.ts";
import {
  answerPref,
  loadPrefs,
  SUMMARY_KEY,
  TRACKING_KEY,
  type PrefKey,
  type PrefStore,
} from "./prefs.ts";
import { errorText, restoreRevision, type RestoreResult } from "./restore.ts";

const LINK_CLASS = "restorer-link";
const LOADING_CLASS = "restorer-loading";
/** sessionStorage key that carries the result notice across the reload. */
const NOTICE_KEY = "restorer-notice";

const STYLES =
  "@keyframes restorer-loading {" +
  '0%, 100% {content: " ⡁"} 16% {content: " ⡈"} 33% {content: " ⠔"} 50% {content: " ⠒"} 66% {content: " ⠢"} 83% {content: " ⢁"}}' +
  '.restorer-loading::after {white-space: pre; content: ""; animation: restorer-loading 0.5s infinite}';

interface Notice {
  message: string;
  type: "success" | "warn" | "error";
}

let busy = false;

if (mw.config.get("wgAction") === "history") {
  void mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(() => {
    $(boot);
  });
}

function boot(): void {
  showStashedNotice();
  const current = mw.config.get("wgCurRevisionId");
  for (const row of document.querySelectorAll<HTMLElement>(
    "li[data-mw-revid]",
  )) {
    addLink(row, current);
  }
  refreshLinks();
  // Settings are shared by every open history tab.
  window.addEventListener("storage", (event) => {
    if (
      event.key == null ||
      event.key === SUMMARY_KEY ||
      event.key === TRACKING_KEY
    ) {
      refreshLinks();
    }
  });
  mw.loader.addStyleTag(STYLES);
}

function addLink(row: HTMLElement, current: number): void {
  const revid = Number(row.getAttribute("data-mw-revid"));
  if (!Number.isInteger(revid) || revid <= 0 || revid === current) return;
  // The undo/thank span. The cur/prev span is also .mw-changeslist-links.
  const tools =
    row.querySelector(".mw-pager-tools") ??
    row.querySelector(".comment + .mw-changeslist-links");
  if (!tools || tools.querySelector(`.${LINK_CLASS}`)) return;
  const link = document.createElement("a");
  link.className = LINK_CLASS;
  // Keep shift-click from selecting text on the way to the prompt.
  link.addEventListener("mousedown", (event) => {
    if (event.shiftKey) event.preventDefault();
  });
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onClick(link, revid, event);
  });
  const item = document.createElement("span");
  item.append(link);
  tools.append(item);
}

function onClick(
  link: HTMLAnchorElement,
  revid: number,
  event: MouseEvent,
): void {
  if (busy) return;
  const prefs = loadPrefs(prefStore());
  switch (clickAction(event)) {
    case "edit-summary":
      editPref(
        SUMMARY_KEY,
        "Additional edit summary for restorer (leave blank to clear):",
        prefs.summary,
      );
      return;
    case "edit-tracking":
      editPref(
        TRACKING_KEY,
        "AI cleanup tracking page (leave blank to clear):",
        prefs.tracking,
      );
      return;
    case "restore":
      void restore(link, revid, prefs.summary, prefs.tracking);
      return;
    case "restore-untracked":
      void restore(link, revid, prefs.summary, "");
      return;
  }
}

function editPref(key: PrefKey, message: string, current: string): void {
  const answer = window.prompt(message, current);
  if (!answerPref(prefStore(), key, answer)) {
    mw.notify("Could not save the restorer setting: localStorage is unavailable.", {
      type: "error",
    });
  }
  refreshLinks();
}

async function restore(
  link: HTMLAnchorElement,
  revid: number,
  extra: string,
  tracking: string,
): Promise<void> {
  busy = true;
  link.classList.add(LOADING_CLASS);
  try {
    const result = await restoreRevision({ revid, extra, tracking });
    stashNotice(resultNotice(revid, result));
    location.reload();
  } catch (error) {
    mw.notify(errorText(error), { type: "error" });
    link.classList.remove(LOADING_CLASS);
    busy = false;
  }
}

function resultNotice(revid: number, result: RestoreResult): Notice {
  const parts = [
    result.edited
      ? `Restored revision ${revid}.`
      : `The page already matches revision ${revid}.`,
  ];
  if (result.edited && result.refreshed) {
    parts.push("Updated deprecated template parameters.");
  }
  const tracking = result.tracking;
  let type: Notice["type"] = "success";
  if (tracking?.status === "marked") {
    parts.push(`Marked it completed on ${tracking.page}.`);
  } else if (tracking?.status === "unchanged") {
    parts.push(`${tracking.page} has no open row for this page.`);
    type = "warn";
  } else if (tracking?.status === "failed") {
    parts.push(`Could not update ${tracking.page}: ${tracking.error}`);
    type = "error";
  }
  return { message: parts.join(" "), type };
}

function stashNotice(notice: Notice): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
  } catch {
    mw.notify(notice.message, { type: notice.type });
  }
}

function showStashedNotice(): void {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let notice: Partial<Notice>;
  try {
    notice = JSON.parse(raw) as Partial<Notice>;
  } catch {
    return;
  }
  if (typeof notice.message !== "string") return;
  const type =
    notice.type === "warn" || notice.type === "error" ? notice.type : "success";
  // Problems stay up until dismissed; they are easy to miss after a reload.
  mw.notify(notice.message, { type, autoHide: type === "success" });
}

function refreshLinks(): void {
  const prefs = loadPrefs(prefStore());
  const label = linkLabel(prefs);
  const tooltip = linkTooltip(prefs);
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    `a.${LINK_CLASS}`,
  )) {
    link.textContent = label;
    if (tooltip) link.title = tooltip;
    else link.removeAttribute("title");
  }
}

function prefStore(): PrefStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
