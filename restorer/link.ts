import type { Prefs } from "./prefs.ts";

export type ClickAction =
  | "restore"
  | "restore-untracked"
  | "edit-summary"
  | "edit-tracking";

/** The modifier keys of a click, as on `MouseEvent`. */
export interface ClickModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Ctrl (Cmd on macOS) edits the extra summary, shift edits the tracking page,
 * and alt restores without touching the tracking page. Checked in that order.
 */
export function clickAction(click: ClickModifiers): ClickAction {
  if (click.ctrlKey || click.metaKey) return "edit-summary";
  if (click.shiftKey) return "edit-tracking";
  if (click.altKey) return "restore-untracked";
  return "restore";
}

/** `restore`, plus `~` with a tracking page and `+` with an extra summary. */
export function linkLabel(prefs: Prefs): string {
  return `restore${prefs.tracking ? "~" : ""}${prefs.summary ? "+" : ""}`;
}

/** The extra summary and the tracking page, one per line. "" when neither is set. */
export function linkTooltip(prefs: Prefs): string {
  return [prefs.summary, prefs.tracking]
    .filter((line) => line !== "")
    .join("\n");
}
