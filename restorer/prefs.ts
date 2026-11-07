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
}

export function loadPrefs(store: PrefStore | null): Prefs {
  return {
    summary: readPref(store, SUMMARY_KEY),
    tracking: readPref(store, TRACKING_KEY),
  };
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
