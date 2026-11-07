/** Extra text appended to every restore edit summary. */
export const SUMMARY_KEY = "restorer-summary";
/** AI cleanup tracking page whose rows are marked completed after a restore. */
export const TRACKING_KEY = "restorer-tracking";

export type PrefKey = typeof SUMMARY_KEY | typeof TRACKING_KEY;

/** The part of `Storage` the restorer uses, so tests can pass a fake. */
export type PrefStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Prefs {
  /** "" when unset. */
  summary: string;
  /** "" when unset. */
  tracking: string;
  /** True when tracking was automatically detected for the current page. */
  autoTracking?: boolean;
}

export function loadPrefs(
  store: PrefStore | null,
  currentPageTitle?: string,
): Prefs {
  cleanAccidentalOriginStorage(store);
  const summary = readPref(store, SUMMARY_KEY);
  const explicitTracking = readPref(store, TRACKING_KEY);

  // If the user explicitly set a tracking page in storage, use it.
  // Otherwise, dynamically detect from ainb-case-origin for the current page ONLY,
  // without writing to storage (so the storage remains blank/unset).
  const autoTracking = !explicitTracking
    ? getAinbCaseOriginTracking(currentPageTitle)
    : null;
  const tracking = explicitTracking || autoTracking || "";

  const isAuto = Boolean(!explicitTracking && autoTracking);

  return {
    summary,
    tracking,
    ...(isAuto ? { autoTracking: true } : {}),
  };
}

function cleanAccidentalOriginStorage(store: PrefStore | null): void {
  try {
    if (!store) return;
    const tracking = store.getItem(TRACKING_KEY);
    if (!tracking) return;
    const origin = getAinbCaseOriginTracking();
    if (
      origin &&
      normalizeTrackingPage(tracking) === normalizeTrackingPage(origin)
    ) {
      store.removeItem(TRACKING_KEY);
    }
  } catch {
    // Ignore
  }
}

/**
 * Reads `ainb-case-origin` from mw.storage / localStorage.
 * Finds any case whose `articles` array contains `currentPageTitle`.
 * If exactly one case matches, returns that case as the tracking page.
 */
export function getAinbCaseOriginTracking(
  currentPageTitle?: string,
): string | null {
  try {
    const current =
      currentPageTitle ??
      (typeof mw !== "undefined" && mw.config
        ? String(mw.config.get("wgPageName") ?? "").replace(/_/g, " ").trim()
        : "");
    if (!current) return null;

    let obj: unknown = null;
    if (
      typeof mw !== "undefined" &&
      mw.storage &&
      typeof mw.storage.getObject === "function"
    ) {
      obj = mw.storage.getObject("ainb-case-origin");
    } else if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("ainb-case-origin");
      if (raw) obj = JSON.parse(raw);
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const targetNorm = normalizePageMatch(current);
      const matchingCases: string[] = [];

      for (const [caseName, caseData] of Object.entries(
        obj as Record<string, unknown>,
      )) {
        if (
          caseData &&
          typeof caseData === "object" &&
          Array.isArray((caseData as { articles?: unknown }).articles)
        ) {
          const articles = (caseData as { articles: unknown[] }).articles;
          const matches = articles.some(
            (art) =>
              typeof art === "string" && normalizePageMatch(art) === targetNorm,
          );
          if (matches) {
            matchingCases.push(caseName);
          }
        }
      }

      if (matchingCases.length === 1 && matchingCases[0]?.trim()) {
        return normalizeTrackingPage(matchingCases[0]);
      }
    }
  } catch {
    // Ignore storage/JSON errors
  }
  return null;
}

function normalizePageMatch(title: string): string {
  return title.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Apply a `prompt()` answer to a setting..
 */
export function answerPref(
  store: PrefStore | null,
  key: PrefKey,
  answer: string | null,
): boolean {
  if (answer == null) return true;
  const value =
    key === TRACKING_KEY ? normalizeTrackingPage(answer) : answer.trim();
  return writePref(store, key, value);
}

/** Accepts a title, a `[[link]]`, or a wiki URL, and returns the page title. */
export function normalizeTrackingPage(input: string): string {
  let value = input.trim();
  const link = /^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/.exec(value);
  if (link) value = link[1] ?? "";
  value = titleFromUrl(value) ?? value;
  const hash = value.indexOf("#");
  if (hash >= 0) value = value.slice(0, hash);
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^:\s*/, "");
}

function titleFromUrl(value: string): string | null {
  if (!/^(?:https?:)?\/\//i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://en.wikipedia.org");
  } catch {
    return null;
  }
  const title = url.searchParams.get("title");
  if (title) return title;
  const path = /\/wiki\/(.+)$/.exec(url.pathname)?.[1];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function readPref(store: PrefStore | null, key: PrefKey): string {
  try {
    return store?.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writePref(
  store: PrefStore | null,
  key: PrefKey,
  value: string,
): boolean {
  if (!store) return false;
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
