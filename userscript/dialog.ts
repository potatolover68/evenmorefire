import { titlesOnPage } from "./contribs.ts";
import { defaultFilters, regexProblem, sameFilters } from "./filters.ts";
import {
  countEdits,
  hasPending,
  sameCleanup,
  selectedCount,
  type CleanupConfig,
  type CleanupReason,
  type FilterConfig,
  type NamespaceInfo,
  type Session,
} from "./types.ts";

export interface DialogController {
  session: Session;
  namespaces: readonly NamespaceInfo[];
  running: boolean;
  persisted: boolean;
  busy: boolean;
  dialog: Morebits_SimpleWindow_Instance | null;
  form: HTMLFormElement | null;
  setForm(form: HTMLFormElement | null): void;
  persist(): Promise<void>;
  applyFilters(
    config: FilterConfig,
    report: (text: string, type: string) => void,
  ): Promise<void>;
  cancel(): Promise<void>;
  advance(cleanup: CleanupConfig | null): Promise<void>;
  saveCleanup(cleanup: CleanupConfig): Promise<void>;
  previous(): void;
  resume(): void;
  pause(): void;
  /** Close the wizard and drop its saved session. */
  finish(): Promise<void>;
  /** Drop contribution highlights while the dialog is closed. */
  conceal(): void;
  /** Current page scrub, shown on step 3. */
  progress: string;
}

let active: DialogController | null = null;
let watching = false;

export function ensureDialog(controller: DialogController): void {
  active = controller;
  const existing = controller.dialog ? dialogElement(controller.dialog) : null;
  if (!controller.dialog || !existing || !document.body.contains(existing)) {
    const dialog = new Morebits.simpleWindow(720, 520);
    dialog.setModality(false);
    controller.dialog = dialog;
    render(controller);
    dialog.display();
    place(controller);
    watchPosition();
    hookClose(dialog, controller);
    return;
  }
  render(controller);
  controller.dialog.focus();
  place(controller);
}

function hookClose(
  dialog: Morebits_SimpleWindow_Instance,
  controller: DialogController,
): void {
  const inner = dialog.close.bind(dialog);
  dialog.close = (event?: Event) => {
    const step = controller.session.step;
    const closed = inner(event as Event);
    if (step >= 2) controller.conceal();
    return closed;
  };
}

export function updateButtons(controller: DialogController): void {
  const root = controller.dialog ? dialogElement(controller.dialog) : null;
  const form = controller.form;
  if (!root || !form) return;
  const step = controller.session.step;
  if (step === 1) {
    const creationsOnly =
      box(form, "includeCreations") && !box(form, "excludeCreations");
    for (const name of ["excludeDisambiguations", "excludeRedirects"]) {
      const input = form.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      );
      if (input) input.disabled = !creationsOnly;
    }
    const read = readFilters(form, controller.namespaces);
    showError(form, read.error);
    const dirty =
      read.error == null &&
      read.config != null &&
      !sameFilters(controller.session.filters, read.config);
    setDisabled(root, "apply", controller.busy || !dirty);
    setDisabled(
      root,
      "next",
      selectedCount(controller.session.highlights) === 0,
    );
    setDisabled(root, "cancel", !controller.persisted);
    return;
  }
  if (step === 2) {
    enforceLocks(form);
    const read = readCleanup(form);
    showError(form, read.error);
    const ready = cleanupReady(read);
    setDisabled(
      root,
      "next",
      selectedCount(controller.session.highlights) === 0 || !ready,
    );
    setDisabled(
      root,
      "save",
      read.config == null ||
        read.error != null ||
        sameCleanup(controller.session.cleanup, read.config),
    );
    setDisabled(root, "previous", false);
    return;
  }
  const finished = !controller.running && !hasPending(controller.session);
  relabel(
    root,
    "resume",
    controller.running ? "Pause" : finished ? "Done" : "Resume",
  );
  const queueState = root.querySelector<HTMLElement>(
    '[name="queueState"] .quickformDescription',
  );
  if (queueState) {
    queueState.classList.add("emf-queue-stats");
    queueState.textContent = queueSummary(controller);
  }
  setDisabled(root, "resume", false);
  setDisabled(root, "previous", false);
}

function queueSummary(controller: DialogController): string {
  const visible = titlesOnPage(controller.session);
  const jobs = Object.values(controller.session.jobs);
  const here = jobs.filter((job) => visible.has(job.title));
  const line = (label: string, group: typeof jobs) => {
    const counts = countEdits(group);
    const marks = [
      counts.prod ? `${counts.prod} LLMPROD` : "",
      counts.aitag ? `${counts.aitag} AI tag` : "",
    ].filter((part) => part !== "");
    const extra = marks.length > 0 ? `, ${marks.join(", ")}` : "";
    return `${label}: ${counts.applied} applied, ${counts.skipped} skipped, ${counts.flagged} flagged${extra}, ${counts.review} awaiting review, ${counts.total} total`;
  };
  const finished = !controller.running && !hasPending(controller.session);
  const running = controller.running
    ? "Processing selected pages."
    : finished
      ? "Processing is finished."
      : "Processing is paused.";
  const progress = controller.progress.trim();
  const detail = progress ? `\n${progress}` : "";
  return `${line("This contributions page", here)}\n${line("All contributions", jobs)}\n${running}${detail}`;
}

function render(controller: DialogController): void {
  const dialog = controller.dialog;
  if (!dialog) return;
  dialog.setScriptName("even more fire!");
  dialog.setTitle(`step ${controller.session.step}`);
  const title = dialogElement(dialog)?.querySelector(".morebits-dialog-title");
  if (title) {
    title.querySelector(".morebits-dialog-scriptname")?.remove();
    const prefix = document.createElement("span");
    prefix.className = "morebits-dialog-scriptname";
    prefix.textContent = "even more fire! \u00B7 ";
    title.prepend(prefix);
  }
  const form = buildForm(controller);
  const node = form.render() as HTMLFormElement;
  for (const name of ["after", "before"]) {
    const input = node.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) continue;
    const value = input.value;
    input.type = "date";
    input.value = value;
  }
  dialog.setContent(node);
  node.noValidate = true;
  controller.setForm(node);
  const refresh = () => updateButtons(controller);
  node.addEventListener("input", refresh);
  node.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.checked) {
      const other =
        target.name === "excludeCreations"
          ? "includeCreations"
          : target.name === "includeCreations"
            ? "excludeCreations"
            : "";
      const box = other
        ? node.querySelector<HTMLInputElement>(`input[name="${other}"]`)
        : null;
      if (box) box.checked = false;
    }
    refresh();
  });
  updateButtons(controller);
}

function buildForm(controller: DialogController): {
  append(data: unknown): void;
  render(): HTMLElement;
} {
  const Form = Morebits.quickForm as unknown as new (
    callback: (event: Event) => void,
  ) => {
    append(data: unknown): void;
    render(): HTMLElement;
  };
  const form = new Form((event) => submit(controller, event));
  const step = controller.session.step;
  if (step === 1) appendFilters(form, controller);
  else if (step === 2) appendCleanup(form, controller.session);
  else {
    form.append({
      type: "div",
      name: "queueState",
      label: "Processing is paused.",
    });
    form.append({ type: "submit", name: "resume", label: "Resume" });
    form.append({ type: "submit", name: "previous", label: "Previous step" });
  }
  return form;
}

function appendFilters(
  form: { append(data: unknown): void },
  controller: DialogController,
): void {
  const filters = controller.session.filters ?? defaultFilters();
  const selected = new Set(
    filters.namespaces ?? controller.namespaces.map((ns) => ns.id),
  );
  form.append({
    type: "number",
    name: "minBytes",
    label: "Minimum byte change",
    value: filters.minBytes ?? "",
  });
  form.append({
    type: "number",
    name: "maxBytes",
    label: "Maximum byte change",
    value: filters.maxBytes ?? "",
  });
  form.append({
    type: "input",
    name: "after",
    label: "Made after",
    value: dateInputValue(filters.after),
  });
  form.append({
    type: "input",
    name: "before",
    label: "Made before",
    value: dateInputValue(filters.before),
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "excludeAuto",
        value: "yes",
        label: "Exclude automated edits",
        checked: filters.excludeAuto,
      },
    ],
  });
  form.append({
    type: "input",
    name: "summaryRegex",
    label: "Edit summary matches regex",
    value: filters.summaryRegex,
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "caseSensitive",
        value: "yes",
        label: "Case sensitive",
        checked: filters.summaryCaseSensitive,
      },
    ],
  });
  form.append({
    type: "checkbox",
    className: "emf-creations",
    list: [
      {
        name: "excludeCreations",
        value: "yes",
        label: "Exclude page creations",
        checked: filters.excludeCreations,
      },
      {
        name: "excludeFollowups",
        value: "yes",
        label: "Exclude followup edits to page creations",
        checked: filters.excludeFollowups,
      },
      {
        name: "includeCreations",
        value: "yes",
        label: "Only include page creations",
        checked: filters.includeCreations && !filters.excludeCreations,
      },
      {
        name: "excludeDisambiguations",
        value: "yes",
        label: "Exclude disambiguation pages",
        checked: filters.excludeDisambiguations,
        disabled: !filters.includeCreations || filters.excludeCreations,
      },
      {
        name: "excludeRedirects",
        value: "yes",
        label: "Exclude redirects",
        checked: filters.excludeRedirects,
        disabled: !filters.includeCreations || filters.excludeCreations,
      },
    ],
  });
  form.append({
    type: "checkbox",
    className: "emf-namespaces",
    label: "In namespaces",
    list: controller.namespaces.map((ns) => ({
      name: "ns",
      value: String(ns.id),
      label: ns.name || "Main",
      checked: selected.has(ns.id),
    })),
  });
  form.append({ type: "submit", name: "next", label: "Next step" });
  form.append({ type: "submit", name: "apply", label: "Apply filters" });
  form.append({ type: "submit", name: "cancel", label: "Cancel" });
}

function appendCleanup(
  form: { append(data: unknown): void },
  session: Session,
): void {
  const cleanup = session.cleanup;
  const lockAuto =
    cleanup.revdel || cleanup.reason === "CV" || cleanup.reason === "other";
  const lockProd = cleanup.reason !== "AI";
  form.append({
    type: "checkbox",
    list: [
      {
        name: "auto",
        value: "yes",
        label: "Automatic cleanup",
        checked: cleanup.auto && !lockAuto,
        disabled: lockAuto,
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
        checked: cleanup.keepBots,
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "skipNonProse",
        value: "yes",
        label: "Skip non-prose edits (experimental)",
        checked: cleanup.skipNonProse,
        tooltip:
          "Keep tables, infoboxes, categories, references, files, and short descriptions. Prose from a tainted edit is still removed.",
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
        checked: cleanup.avoidOrphans,
        tooltip:
          "Delete a sentence fragment, such as a which-clause, when the rest of its sentence was removed.",
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
        checked: cleanup.untaintedTemplates !== false,
        tooltip:
          "Leave each template as it appears now. A tainted edit cannot remove it or leave a second copy.",
      },
    ],
  });
  form.append({
    type: "checkbox",
    adminonly: true,
    list: [
      {
        name: "revdel",
        value: "yes",
        label: "Revdel after cleanup",
        checked: cleanup.revdel,
        tooltip:
          "When you apply a reviewed edit, revdel every revision from the first tainted edit through that cleanup edit.",
      },
    ],
  });
  form.append({
    type: "input",
    name: "tracking",
    label: "AI cleanup tracking page",
    value: cleanup.trackingPage,
  });
  form.append({
    type: "input",
    name: "summary",
    label: "Additional edit summary",
    value: cleanup.summary,
  });
  form.append({
    type: "select",
    name: "reason",
    label: "Reason",
    list: [
      { type: "option", label: "", value: "", selected: cleanup.reason === "" },
      {
        type: "option",
        label: "AI",
        value: "AI",
        selected: cleanup.reason === "AI",
      },
      {
        type: "option",
        label: "CV",
        value: "CV",
        selected: cleanup.reason === "CV",
      },
      {
        type: "option",
        label: "other",
        value: "other",
        selected: cleanup.reason === "other",
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "llmprod",
        value: "yes",
        label: "LLMPROD page creations with more than",
        checked: cleanup.llmprod && !lockProd,
        disabled: lockProd,
      },
    ],
  });
  form.append({
    type: "number",
    name: "llmprodPercent",
    label: "% authorship",
    value: cleanup.llmprodPercent ?? "",
    min: 0,
    max: 100,
    disabled: lockProd || !cleanup.llmprod,
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "llmprodAuto",
        value: "yes",
        label: "Automatically apply LLMPRODs and AI tags",
        checked:
          cleanup.llmprodAuto &&
          (cleanup.llmprod || cleanup.aiTag) &&
          !lockProd,
        disabled: lockProd || (!cleanup.llmprod && !cleanup.aiTag),
      },
    ],
  });
  form.append({
    type: "checkbox",
    list: [
      {
        name: "aiTag",
        value: "yes",
        label: "AI tag article creations with more than",
        checked: cleanup.aiTag && !lockProd,
        disabled: lockProd,
      },
    ],
  });
  form.append({
    type: "number",
    name: "aiTagPercent",
    label: "% authorship",
    value: cleanup.aiTagPercent ?? "",
    min: 0,
    max: 100,
    disabled: lockProd || !cleanup.aiTag,
  });
  form.append({ type: "submit", name: "next", label: "Next step" });
  form.append({ type: "submit", name: "save", label: "Save" });
  form.append({ type: "submit", name: "previous", label: "Previous step" });
}

function submit(controller: DialogController, event: Event): void {
  event.preventDefault();
  const form = controller.form;
  if (!form || submitterDisabled(event)) return;
  const name = submitName(event);
  if (name === "apply") {
    const read = readFilters(form, controller.namespaces);
    if (!read.config || read.error) {
      showError(form, read.error);
      return;
    }
    const status = statusLine(form);
    void controller
      .applyFilters(read.config, (text, type) => status.update(text, type))
      .then(() => updateButtons(controller))
      .catch((error: unknown) => {
        status.update(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      });
    return;
  }
  if (name === "cancel") {
    void controller.cancel();
    return;
  }
  if (name === "save") {
    const read = readCleanup(form);
    if (!read.config || read.error) return;
    void controller
      .saveCleanup(read.config)
      .then(() => updateButtons(controller));
    return;
  }
  if (name === "next") {
    if (controller.session.step === 1) {
      void controller.advance(null);
      return;
    }
    const read = readCleanup(form);
    if (!cleanupReady(read) || !read.config) {
      showError(
        form,
        read.error ?? "Additional edit summary and reason are required",
      );
      return;
    }
    void controller.advance(read.config);
    return;
  }
  if (name === "previous") controller.previous();
  if (name === "resume") {
    if (controller.running) controller.pause();
    else if (!hasPending(controller.session)) void controller.finish();
    else controller.resume();
  }
}

function readFilters(
  form: HTMLFormElement,
  namespaces: readonly NamespaceInfo[],
): { config: FilterConfig | null; error: string | null } {
  const minBytes = numberOrNull(text(form, "minBytes"));
  const maxBytes = numberOrNull(text(form, "maxBytes"));
  if (minBytes === undefined)
    return fail("Minimum byte change must be a number");
  if (maxBytes === undefined)
    return fail("Maximum byte change must be a number");
  if (minBytes != null && maxBytes != null && minBytes > maxBytes) {
    return fail("Minimum byte change is above the maximum");
  }
  const afterRaw = text(form, "after");
  const beforeRaw = text(form, "before");
  const after = afterRaw ? dateBound(afterRaw, false) : null;
  const before = beforeRaw ? dateBound(beforeRaw, true) : null;
  if (afterRaw && !after) return fail("Made after is not a valid date");
  if (beforeRaw && !before) return fail("Made before is not a valid date");
  if (after && before && Date.parse(after) > Date.parse(before)) {
    return fail("After is later than before");
  }
  const summaryRegex = text(form, "summaryRegex");
  const problem = regexProblem(summaryRegex);
  if (problem) return fail(problem);
  const checked = [
    ...form.querySelectorAll<HTMLInputElement>('input[name="ns"]:checked'),
  ].map((input) => Number(input.value));
  return {
    error: null,
    config: {
      minBytes,
      maxBytes,
      after,
      before,
      excludeAuto: box(form, "excludeAuto"),
      excludeCreations: box(form, "excludeCreations"),
      excludeFollowups: box(form, "excludeFollowups"),
      includeCreations:
        box(form, "includeCreations") && !box(form, "excludeCreations"),
      excludeDisambiguations: box(form, "excludeDisambiguations"),
      excludeRedirects: box(form, "excludeRedirects"),
      summaryRegex,
      summaryCaseSensitive: box(form, "caseSensitive"),
      namespaces: checked.length === namespaces.length ? null : checked,
    },
  };
}

function readCleanup(form: HTMLFormElement): {
  config: CleanupConfig | null;
  error: string | null;
} {
  enforceLocks(form);
  const reasonRaw = text(form, "reason");
  const reason: CleanupReason =
    reasonRaw === "AI" || reasonRaw === "CV" || reasonRaw === "other"
      ? reasonRaw
      : "";
  const percent = numberOrNull(text(form, "llmprodPercent"));
  if (percent === undefined) return fail("Authorship percent must be a number");
  const aiPercent = numberOrNull(text(form, "aiTagPercent"));
  if (aiPercent === undefined)
    return fail("AI tag authorship percent must be a number");
  const llmprod = box(form, "llmprod");
  const aiTag = box(form, "aiTag");
  if (llmprod && (percent == null || percent < 0 || percent > 100)) {
    return fail("Enter an authorship percent from 0 to 100");
  }
  if (aiTag && (aiPercent == null || aiPercent < 0 || aiPercent > 100)) {
    return fail("Enter an AI tag authorship percent from 0 to 100");
  }
  return {
    error: null,
    config: {
      auto: box(form, "auto"),
      revdel: box(form, "revdel"),
      keepBots: box(form, "keepBots"),
      skipNonProse: box(form, "skipNonProse"),
      avoidOrphans: box(form, "avoidOrphans"),
      untaintedTemplates: box(form, "untaintedTemplates"),
      trackingPage: text(form, "tracking"),
      summary: text(form, "summary"),
      reason,
      llmprod,
      llmprodPercent: percent,
      llmprodAuto: (llmprod || aiTag) && box(form, "llmprodAuto"),
      aiTag,
      aiTagPercent: aiPercent,
    },
  };
}

function cleanupReady(read: {
  config: CleanupConfig | null;
  error: string | null;
}): boolean {
  return (
    read.error == null &&
    read.config != null &&
    read.config.summary.trim() !== "" &&
    read.config.reason !== ""
  );
}

function enforceLocks(form: HTMLFormElement): void {
  const reason = text(form, "reason");
  const revdel = box(form, "revdel");
  const lockAuto = revdel || reason === "CV" || reason === "other";
  const lockProd = reason !== "AI";
  lock(form, "auto", lockAuto);
  lock(form, "llmprod", lockProd);
  lock(form, "aiTag", lockProd);
  const prod = form.querySelector<HTMLInputElement>('input[name="llmprod"]');
  const ai = form.querySelector<HTMLInputElement>('input[name="aiTag"]');
  const prodOn = !lockProd && !!prod?.checked && !prod.disabled;
  const aiOn = !lockProd && !!ai?.checked && !ai.disabled;
  lock(form, "llmprodAuto", !(prodOn || aiOn));
  const percent = form.querySelector<HTMLInputElement>(
    'input[name="llmprodPercent"]',
  );
  if (percent) percent.disabled = !prodOn;
  const aiPercent = form.querySelector<HTMLInputElement>(
    'input[name="aiTagPercent"]',
  );
  if (aiPercent) aiPercent.disabled = !aiOn;
}

function lock(form: HTMLFormElement, name: string, locked: boolean): void {
  const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) return;
  if (locked) input.checked = false;
  input.disabled = locked;
}

function statusLine(form: HTMLFormElement): {
  update(text: string, type: string): void;
} {
  let slot = form.querySelector<HTMLElement>(".emf-status-slot");
  if (!slot) {
    slot = document.createElement("div");
    slot.className = "emf-status-slot";
    form.append(slot);
  }
  Morebits.status.init(slot);
  return new (Morebits.status as unknown as new (
    text: string,
    stat: string,
    type: string,
  ) => { update(text: string, type: string): void })(
    "Contributions",
    "starting…",
    "status",
  );
}

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function dateBound(raw: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;
  return endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
}

function showError(form: HTMLFormElement, message: string | null): void {
  let el = form.querySelector<HTMLElement>(".emf-error");
  if (!el) {
    el = document.createElement("div");
    el.className = "emf-error";
    form.append(el);
  }
  el.textContent = message ?? "";
}

function text(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name);
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }
  return "";
}

function box(form: HTMLFormElement, name: string): boolean {
  const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  return !!el && el.checked && !el.disabled;
}

function numberOrNull(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function fail(error: string): { config: null; error: string } {
  return { config: null, error };
}

function submitName(event: Event): string {
  const submitter = (event as SubmitEvent).submitter;
  if (
    submitter instanceof HTMLInputElement ||
    submitter instanceof HTMLButtonElement
  ) {
    return submitter.name || submitter.getAttribute("name") || "";
  }
  return "";
}

function submitterDisabled(event: Event): boolean {
  const submitter = (event as SubmitEvent).submitter;
  return (
    (submitter instanceof HTMLInputElement ||
      submitter instanceof HTMLButtonElement) &&
    submitter.disabled
  );
}

function relabel(root: HTMLElement, name: string, label: string): void {
  const control = root.querySelector<HTMLInputElement>(
    `input[type="submit"][name="${name}"]`,
  );
  if (!control) return;
  const previous = control.value;
  control.value = label;
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    ".morebits-dialog-buttons button",
  )) {
    if (button.dataset.emf === name || button.textContent === previous) {
      button.textContent = label;
      button.dataset.emf = name;
    }
  }
}

function setDisabled(root: HTMLElement, name: string, disabled: boolean): void {
  const control = root.querySelector<HTMLInputElement | HTMLButtonElement>(
    `input[type="submit"][name="${name}"], button[name="${name}"]`,
  );
  if (!control) return;
  control.disabled = disabled;
  const label =
    control instanceof HTMLInputElement ? control.value : control.textContent;
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    ".morebits-dialog-buttons button",
  )) {
    if (button.textContent === label) button.disabled = disabled;
  }
}

function place(controller: DialogController): void {
  const root = controller.dialog ? dialogElement(controller.dialog) : null;
  if (!root) return;
  const position = clampViewport(
    controller.session.position ?? viewportFromElement(root),
  );
  controller.session.position = position;
  paintDocumentPosition(root, position);
}

export function resetDialogPosition(controller: DialogController): void {
  const root = controller.dialog ? dialogElement(controller.dialog) : null;
  if (!root) return;
  const height = root.offsetHeight || 320;
  const width = root.offsetWidth || 720;
  controller.session.position = clampViewport({
    top: Math.max(0, window.innerHeight / 2 - height / 2),
    left: Math.max(0, window.innerWidth / 2 - width / 2),
  });
  paintDocumentPosition(root, controller.session.position);
}

function paintDocumentPosition(
  root: HTMLElement,
  position: { top: number; left: number },
): void {
  root.style.top = `${position.top + window.scrollY}px`;
  root.style.left = `${position.left + window.scrollX}px`;
}

function viewportFromElement(root: HTMLElement): { top: number; left: number } {
  const top = Number.parseFloat(root.style.top);
  const left = Number.parseFloat(root.style.left);
  return {
    top: (Number.isFinite(top) ? top : 0) - window.scrollY,
    left: (Number.isFinite(left) ? left : 0) - window.scrollX,
  };
}

function clampViewport(position: { top: number; left: number }): {
  top: number;
  left: number;
} {
  return {
    top: Math.min(
      Math.max(0, position.top),
      Math.max(0, window.innerHeight - 48),
    ),
    left: Math.min(
      Math.max(0, position.left),
      Math.max(0, window.innerWidth - 48),
    ),
  };
}

function watchPosition(): void {
  if (watching) return;
  watching = true;
  document.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".morebits-dialog-titlebar")) return;
    event.preventDefault();
    document.documentElement.classList.add("emf-dragging");
    window.getSelection()?.removeAllRanges();
  });
  window.addEventListener("mouseup", () => {
    document.documentElement.classList.remove("emf-dragging");
    if (!active?.dialog) return;
    const root = dialogElement(active.dialog);
    if (!root) return;
    const next = clampViewport(viewportFromElement(root));
    const current = active.session.position;
    if (current && current.top === next.top && current.left === next.left)
      return;
    active.session.position = next;
    void active.persist();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (document.documentElement.classList.contains("emf-dragging")) return;
      if (!active?.dialog || !active.session.position) return;
      const root = dialogElement(active.dialog);
      if (!root) return;
      paintDocumentPosition(root, active.session.position);
    },
    { passive: true },
  );
}

function dialogElement(
  dialog: Morebits_SimpleWindow_Instance,
): HTMLElement | null {
  const query = dialog.$dialog;
  if (query instanceof HTMLElement) return query;
  const node = query?.[0] ?? query?.get?.(0);
  return node instanceof HTMLElement ? node : null;
}
