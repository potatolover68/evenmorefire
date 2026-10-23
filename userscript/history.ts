import { reviewSelection } from "./cleanup.ts";
import { injectPageStyles } from "./style.ts";
import type { CleanupReason } from "./types.ts";

interface HistoryEdit {
  revid: number;
  user: string;
  timestamp: string;
  box: HTMLInputElement;
}

const selected = new Set<number>();

export function bootHistory(): void {
  injectPageStyles();
  const portlet = mw.util.addPortletLink(
    "p-tb",
    "#",
    "emf!",
    "t-emf-history",
    "even more fire!",
  );
  portlet?.querySelector("a")?.addEventListener("click", (event) => {
    event.preventDefault();
    const edits = ensureBoxes();
    if (edits.length === 0) return;
    openDialog(edits);
  });
}

function ensureBoxes(): HistoryEdit[] {
  const edits: HistoryEdit[] = [];
  for (const row of document.querySelectorAll<HTMLElement>(
    "#pagehistory li[data-mw-revid]",
  )) {
    const revid = Number(row.getAttribute("data-mw-revid"));
    if (!Number.isFinite(revid)) continue;
    let box = row.querySelector<HTMLInputElement>("input.emf-tick");
    if (!box) {
      box = document.createElement("input");
      box.type = "checkbox";
      box.className = "emf-tick";
      box.addEventListener("change", () => {
        if (box!.checked) selected.add(revid);
        else selected.delete(revid);
        syncRemove();
      });
      row.prepend(box);
    }
    box.checked = selected.has(revid);
    edits.push({
      revid,
      user: usernameFrom(row),
      timestamp: row.querySelector("time")?.getAttribute("datetime") ?? "",
      box,
    });
  }
  return edits;
}

function usernameFrom(row: HTMLElement): string {
  const link = row.querySelector("a.mw-userlink");
  const title = link?.getAttribute("title") ?? "";
  if (title.startsWith("User:")) return title.slice("User:".length).replace(/_/g, " ");
  const text = link?.textContent?.replace(/_/g, " ").trim();
  return text || "unknown";
}

let syncRemove = (): void => {};

function openDialog(edits: HistoryEdit[]): void {
  const title = String(mw.config.get("wgPageName") ?? "").replace(/_/g, " ");
  const dialog = new Morebits.simpleWindow(640, 520);
  dialog.setScriptName("even more fire!");
  dialog.setTitle("history");
  const Form = Morebits.quickForm as unknown as new (
    callback: (event: Event) => void,
  ) => {
    append(data: unknown): void;
    render(): HTMLElement;
  };
  const form = new Form((event) => event.preventDefault());
  const users = new Map<string, HistoryEdit[]>();
  for (const edit of edits) {
    const list = users.get(edit.user) ?? [];
    list.push(edit);
    users.set(edit.user, list);
  }
  const names = [...users.keys()].sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const count = users.get(name)!.length;
    form.append({
      type: "div",
      label: `${name} (${count})`,
    });
    form.append({
      type: "button",
      name: `select-${name}`,
      label: "Select all",
      event: () => setUser(users.get(name)!, true),
    });
    form.append({
      type: "button",
      name: `clear-${name}`,
      label: "Unselect all",
      event: () => setUser(users.get(name)!, false),
    });
  }
  form.append({
    type: "input",
    name: "summary",
    label: "Additional edit summary",
  });
  form.append({
    type: "select",
    name: "reason",
    label: "Reason",
    list: [
      { type: "option", label: "", value: "" },
      { type: "option", label: "AI", value: "AI" },
      { type: "option", label: "CV", value: "CV" },
      { type: "option", label: "other", value: "other" },
    ],
  });
  form.append({
    type: "button",
    name: "remove",
    label: "Remove selected edits",
    disabled: true,
    event: () => {
      void removeSelected(title);
    },
  });
  form.append({
    type: "div",
    name: "historyState",
    label: "Selections are not saved.",
  });
  const node = form.render() as HTMLFormElement;
  node.noValidate = true;
  dialog.setContent(node);
  dialog.display();
  const say = (text: string) => {
    const slot = node.querySelector<HTMLElement>(
      '[name="historyState"] .quickformDescription',
    );
    if (slot) slot.textContent = text;
  };
  const sync = () => {
    const button = node.querySelector<HTMLInputElement>('input[name="remove"]');
    const reason = readReason(node);
    const summary = node.querySelector<HTMLInputElement>('input[name="summary"]');
    if (button) {
      button.disabled =
        selected.size === 0 || reason === "" || !summary?.value.trim();
    }
  };
  syncRemove = sync;
  node.addEventListener("input", sync);
  node.addEventListener("change", sync);
  sync();

  async function removeSelected(page: string): Promise<void> {
    const reason = readReason(node);
    const summary =
      node.querySelector<HTMLInputElement>('input[name="summary"]')?.value ??
      "";
    if (selected.size === 0 || reason === "" || !summary.trim()) return;
    const button = node.querySelector<HTMLInputElement>('input[name="remove"]');
    if (button) button.disabled = true;
    const metas: Record<string, string> = {};
    for (const edit of edits) {
      if (selected.has(edit.revid)) metas[String(edit.revid)] = edit.timestamp;
    }
    try {
      await reviewSelection(page, [...selected], metas, { reason, summary }, say);
    } catch (error) {
      say(error instanceof Error ? error.message : String(error));
    } finally {
      sync();
    }
  }
}

function setUser(edits: readonly HistoryEdit[], checked: boolean): void {
  for (const edit of edits) {
    edit.box.checked = checked;
    if (checked) selected.add(edit.revid);
    else selected.delete(edit.revid);
  }
  syncRemove();
}

function readReason(form: HTMLFormElement): Exclude<CleanupReason, ""> | "" {
  const value = form.querySelector<HTMLSelectElement>('select[name="reason"]')
    ?.value;
  if (value === "AI" || value === "CV" || value === "other") return value;
  return "";
}
