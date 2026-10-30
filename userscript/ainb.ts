import { diffIdsFromHrefs } from "./ainb-links.ts";
import { reviewSelection } from "./cleanup.ts";
import { loadRecord, saveRecord } from "./session.ts";
import { injectPageStyles } from "./style.ts";
import type { CleanupReason } from "./types.ts";

export interface CaseSettings {
  summary: string;
  reason: CleanupReason;
  keepBots: boolean;
  skipNonProse: boolean;
  avoidOrphans: boolean;
  untaintedTemplates: boolean;
}

export function bootAinb(): void {
  injectPageStyles();
  const scan = () => {
    if (!document.body) return;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "button.ainb-edit-btn",
    )) {
      if (button.parentElement?.querySelector(".emf-ainb-btn")) continue;
      const fire = document.createElement("button");
      fire.type = "button";
      fire.className = "emf-ainb-btn";
      fire.textContent = "🔥";
      fire.title = "Remove the edits listed in this row";
      fire.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openCase(button);
      });
      button.after(fire);
    }
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function articleTitle(button: HTMLButtonElement): string {
  const cell = button.closest("td");
  const next = cell?.nextElementSibling;
  const link = next?.querySelector("a");
  return link?.getAttribute("title")?.replace(/_/g, " ").trim() ?? "";
}

function rowDiffs(button: HTMLButtonElement): number[] {
  const row = button.closest("tr");
  if (!row) return [];
  return diffIdsFromHrefs(
    [...row.querySelectorAll("a")].map(
      (link) => link.getAttribute("href") ?? "",
    ),
  );
}

function casePage(): string {
  return String(mw.config.get("wgPageName") ?? "").replace(/_/g, " ");
}

function settingsKey(): string {
  const db = String(mw.config.get("wgDBname") ?? "enwiki");
  return `ainb:${db}:${casePage()}`;
}

async function openCase(button: HTMLButtonElement): Promise<void> {
  const article = articleTitle(button);
  const diffs = rowDiffs(button);
  if (!article) return;
  const saved = await loadRecord<CaseSettings>(settingsKey());
  const settings: CaseSettings = {
    summary: saved?.summary ?? "",
    reason: saved?.reason ?? "",
    keepBots: saved?.keepBots === true,
    skipNonProse: saved?.skipNonProse === true,
    avoidOrphans: saved?.avoidOrphans === true,
    untaintedTemplates: saved?.untaintedTemplates !== false,
  };
  openDialog(article, diffs, settings);
}

function openDialog(
  article: string,
  diffs: readonly number[],
  settings: CaseSettings,
): void {
  const dialog = new Morebits.simpleWindow(640, 560);
  dialog.setScriptName("even more fire!");
  dialog.setTitle(article);
  const Form = Morebits.quickForm as unknown as new (
    callback: (event: Event) => void,
  ) => {
    append(data: unknown): void;
    render(): HTMLElement;
  };
  const form = new Form((event) => event.preventDefault());
  form.append({
    type: "input",
    name: "summary",
    label: "Additional edit summary",
    value: settings.summary,
  });
  form.append({
    type: "select",
    name: "reason",
    label: "Reason",
    list: [
      {
        type: "option",
        label: "",
        value: "",
        selected: settings.reason === "",
      },
      {
        type: "option",
        label: "AI",
        value: "AI",
        selected: settings.reason === "AI",
      },
      {
        type: "option",
        label: "CV",
        value: "CV",
        selected: settings.reason === "CV",
      },
      {
        type: "option",
        label: "other",
        value: "other",
        selected: settings.reason === "other",
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "keepBots",
        value: "yes",
        label: "Do not undo bot edits",
        checked: settings.keepBots,
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "skipNonProse",
        value: "yes",
        label: "Skip non-prose edits",
        checked: settings.skipNonProse,
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "avoidOrphans",
        value: "yes",
        label: "Avoid orphaned fragments",
        checked: settings.avoidOrphans,
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "untaintedTemplates",
        value: "yes",
        label: "Templates cannot be tainted",
        checked: settings.untaintedTemplates,
      },
    ],
  });
  if (diffs.length === 0) {
    form.append({
      type: "div",
      label: "This row has no diff links.",
    });
  } else {
    form.append({
      type: "checkbox",
      list: diffs.map((id) => ({
        name: `rev-${id}`,
        value: "yes",
        label: `Special:Diff/${id}`,
        checked: true,
      })),
    });
  }
  form.append({
    type: "button",
    name: "remove",
    label: "Remove selected edits",
    disabled: true,
  });
  form.append({
    type: "div",
    name: "caseState",
    label: "Reading saved settings.",
  });
  const node = form.render() as HTMLFormElement;
  node.noValidate = true;
  dialog.setContent(node);
  dialog.display();
  const say = (text: string) => {
    const slot = node.querySelector<HTMLElement>(
      '[name="caseState"] .quickformDescription',
    );
    if (slot) slot.textContent = text;
  };
  const read = (): CaseSettings => ({
    summary:
      node.querySelector<HTMLInputElement>('input[name="summary"]')?.value ??
      "",
    reason: readReason(node),
    keepBots: checked(node, "keepBots"),
    skipNonProse: checked(node, "skipNonProse"),
    avoidOrphans: checked(node, "avoidOrphans"),
    untaintedTemplates: checked(node, "untaintedTemplates"),
  });
  const selectedIds = () => diffs.filter((id) => checked(node, `rev-${id}`));
  const sync = () => {
    const button = node.querySelector<HTMLInputElement>('input[name="remove"]');
    const current = read();
    if (button) {
      button.disabled =
        selectedIds().length === 0 ||
        current.reason === "" ||
        !current.summary.trim();
    }
  };
  const remember = () => {
    void saveRecord(settingsKey(), read());
  };
  node.addEventListener("input", () => {
    sync();
    remember();
  });
  node.addEventListener("change", () => {
    sync();
    remember();
  });
  node.querySelector('input[name="remove"]')?.addEventListener("click", () => {
    void proceed(article, selectedIds(), read(), say, sync, node);
  });
  sync();
  say("Settings are saved for this case page.");
}

async function proceed(
  article: string,
  revids: readonly number[],
  settings: CaseSettings,
  say: (text: string) => void,
  sync: () => void,
  form: HTMLFormElement,
): Promise<void> {
  if (
    revids.length === 0 ||
    settings.reason === "" ||
    !settings.summary.trim()
  ) {
    return;
  }
  await saveRecord(settingsKey(), settings);
  const button = form.querySelector<HTMLInputElement>('input[name="remove"]');
  if (button) button.disabled = true;
  const metas: Record<string, string> = {};
  for (const id of revids) metas[String(id)] = String(id).padStart(14, "0");
  try {
    await reviewSelection(
      article,
      [...revids],
      metas,
      {
        reason: settings.reason,
        summary: settings.summary,
        keepBots: settings.keepBots,
        skipNonProse: settings.skipNonProse,
        avoidOrphans: settings.avoidOrphans,
        untaintedTemplates: settings.untaintedTemplates,
        trackingPage: casePage(),
        rowActions: true,
        markUnchanged: true,
      },
      say,
    );
  } catch (error) {
    say(error instanceof Error ? error.message : String(error));
  } finally {
    sync();
  }
}

function checked(form: HTMLFormElement, name: string): boolean {
  return (
    form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ===
    true
  );
}

function readReason(form: HTMLFormElement): CleanupReason {
  const value = form.querySelector<HTMLSelectElement>(
    'select[name="reason"]',
  )?.value;
  if (value === "AI" || value === "CV" || value === "other") return value;
  return "";
}
