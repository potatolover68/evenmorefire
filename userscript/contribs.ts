import type { NamespaceInfo, RevisionMeta, Session, Step } from "./types.ts";

const ROW_CLASSES = [
  "emf-filters",
  "emf-manual",
  "emf-excluded",
  "emf-selected",
];

const LINKED = new Set([
  "processed",
  "flagged",
  "review",
  "applied",
  "skipped",
  "undone",
]);

const STATUS_LABEL: Record<string, string> = {
  processing: "being processed",
  processed: "processed",
  flagged: "awaiting review (flagged)",
  review: "awaiting review",
  applied: "applied",
  skipped: "skipped",
  undone: "undone",
};

let bound = false;

export function bindRowToggles(
  handler: (revid: number, checked: boolean, row: HTMLElement) => void,
): void {
  if (bound) return;
  bound = true;
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
      return;
    }
    if (!target.matches('input[name^="ids"], input.emf-tick')) return;
    const row = target.closest<HTMLElement>("li[data-mw-revid]");
    if (!row) return;
    const revid = Number(row.getAttribute("data-mw-revid"));
    if (!Number.isFinite(revid)) return;
    handler(revid, target.checked, row);
  });
}

export function paintRows(
  session: Session,
  step: Step,
  onOpen: (title: string) => void,
): void {
  document.body.classList.toggle("emf-focus", step >= 2);
  for (const row of document.querySelectorAll<HTMLElement>(
    "li[data-mw-revid]",
  )) {
    const revid = row.getAttribute("data-mw-revid") ?? "";
    const reason = session.highlights[revid];
    row.classList.remove(...ROW_CLASSES);
    if (reason) row.classList.add(`emf-${reason}`);
    if (reason === "filters" || reason === "manual") {
      row.classList.add("emf-selected");
    }
    ensureBox(row, revid).checked = reason === "filters" || reason === "manual";
    paintStatus(row, session, revid, onOpen);
  }
}

export function clearRowPaint(): void {
  document.body.classList.remove("emf-focus");
  for (const row of document.querySelectorAll<HTMLElement>(
    "li[data-mw-revid]",
  )) {
    row.classList.remove(...ROW_CLASSES);
    for (const box of row.querySelectorAll("input.emf-tick")) box.remove();
    const native = row.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name^="ids"]',
    );
    if (native) native.checked = false;
    row.querySelector(".emf-status")?.remove();
  }
}

export function metaFromRow(
  row: HTMLElement,
  namespaces: readonly NamespaceInfo[],
): RevisionMeta | null {
  const link = row.querySelector<HTMLAnchorElement>("a.mw-contributions-title");
  const title = link?.getAttribute("title")?.replace(/_/g, " ").trim();
  if (!title) return null;
  return {
    title,
    timestamp: row.querySelector("time")?.getAttribute("datetime") ?? "",
    isNew: row.querySelector(".newpage, .mw-new-page, .mw-newpage") != null,
    pageid: null,
    ns: namespaceOf(title, namespaces),
  };
}

export function namespaceOf(
  title: string,
  namespaces: readonly NamespaceInfo[],
): number {
  const normalized = title.replace(/_/g, " ");
  let best = 0;
  let bestLength = 0;
  for (const ns of namespaces) {
    if (!ns.name) continue;
    const prefix = `${ns.name}:`;
    if (normalized.startsWith(prefix) && prefix.length > bestLength) {
      best = ns.id;
      bestLength = prefix.length;
    }
  }
  return best;
}

export function titlesOnPage(session: Session): Set<string> {
  const titles = new Set<string>();
  for (const row of document.querySelectorAll<HTMLElement>(
    "li[data-mw-revid]",
  )) {
    const revid = row.getAttribute("data-mw-revid") ?? "";
    const reason = session.highlights[revid];
    if (reason !== "filters" && reason !== "manual") continue;
    const title = session.metas[revid]?.title;
    if (title) titles.add(title);
  }
  return titles;
}

export function nextContributionsHref(): string | null {
  const link = document.querySelector<HTMLAnchorElement>(
    "a.mw-nextlink, .mw-pager-navigation-bar a[rel='next']",
  );
  return link?.href || null;
}

export function offsetAfterLatest(
  timestamps: readonly string[],
): string | null {
  let latest = Number.NEGATIVE_INFINITY;
  for (const stamp of timestamps) {
    const ms = Date.parse(stamp);
    if (Number.isNaN(ms)) continue;
    if (ms > latest) latest = ms;
  }
  if (!Number.isFinite(latest)) return null;
  return mediawikiTimestamp(new Date(latest + 60 * 60 * 1000));
}

export function mediawikiTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    String(date.getUTCFullYear()) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

function ensureBox(row: HTMLElement, revid: string): HTMLInputElement {
  const found = row.querySelector<HTMLInputElement>(
    'input[type="checkbox"][name^="ids"], input.emf-tick',
  );
  if (found) return found;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "emf-tick";
  input.name = `ids[${revid}]`;
  row.prepend(input);
  return input;
}

function paintStatus(
  row: HTMLElement,
  session: Session,
  revid: string,
  onOpen: (title: string) => void,
): void {
  row.querySelector(".emf-status")?.remove();
  const found = jobForRow(session, revid);
  if (!found || found.job.status === "pending") return;
  const prod = found.job.explanations.some(
    (item) => item.action === "llm-prod",
  );
  const label = prod
    ? "LLMPROD"
    : (STATUS_LABEL[found.job.status] ?? found.job.status);
  const span = document.createElement("span");
  span.className = `emf-status emf-status-${found.job.status}${prod ? " emf-status-prod" : ""}`;
  if (LINKED.has(found.job.status)) {
    const anchor = document.createElement("a");
    anchor.href = "#";
    anchor.textContent = label;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      onOpen(found.title);
    });
    span.append(anchor);
  } else {
    span.textContent = label;
  }
  row.append(span);
}

function jobForRow(
  session: Session,
  revid: string,
): { title: string; job: Session["jobs"][string] } | null {
  const metaTitle = session.metas[revid]?.title;
  if (metaTitle && session.jobs[metaTitle]) {
    return { title: metaTitle, job: session.jobs[metaTitle] };
  }
  const id = Number(revid);
  for (const job of Object.values(session.jobs)) {
    if (job.taintedRevids.includes(id)) return { title: job.title, job };
  }
  if (!metaTitle) return null;
  const wanted = metaTitle.replace(/_/g, " ");
  for (const job of Object.values(session.jobs)) {
    if (job.title.replace(/_/g, " ") === wanted)
      return { title: job.title, job };
  }
  return null;
}
