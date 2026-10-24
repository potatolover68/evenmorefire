import { fetchAllowlist, isAllowlisted } from "./allowlist.ts";
import { openJob, runQueue, syncJobs, type CleanupHost } from "./cleanup.ts";
import { bootHistory } from "./history.ts";
import {
  bindRowToggles,
  clearRowPaint,
  metaFromRow,
  offsetAfterLatest,
  paintRows,
} from "./contribs.ts";
import {
  ensureDialog,
  resetDialogPosition,
  updateButtons,
  type DialogController,
} from "./dialog.ts";
import { matchContrib, mergeHighlights } from "./filters.ts";
import {
  fetchAutoTools,
  fetchContributions,
  titlesCreatedBy,
} from "./mediawiki.ts";
import { deleteSession, loadSession, saveSession } from "./session.ts";
import { injectPageStyles } from "./style.ts";
import {
  emptySession,
  type CleanupConfig,
  type FilterConfig,
  type NamespaceInfo,
  type Session,
} from "./types.ts";

export function boot(): void {
  if (typeof mw === "undefined" || typeof Morebits === "undefined") return;
  const viewer = mw.config.get("wgUserName");
  if (typeof viewer !== "string" || !viewer) return;
  const special = mw.config.get("wgCanonicalSpecialPageName");
  const action = mw.config.get("wgAction");
  if (special !== "Contributions" && action !== "history") return;
  void fetchAllowlist().then((names) => {
    if (!isAllowlisted(viewer, names)) return;
    if (action === "history") {
      bootHistory();
      return;
    }
    const user = targetUser();
    if (!user) return;
    start(user);
  });
}

function start(user: string): void {
  injectPageStyles();
  const app = new App(
    user,
    String(mw.config.get("wgServerName") ?? "en.wikipedia.org"),
    String(mw.config.get("wgDBname") ?? "enwiki"),
  );
  const portlet = mw.util.addPortletLink(
    "p-tb",
    "#",
    "emf!",
    "t-emf",
    "even more fire!",
  );
  portlet?.querySelector("a")?.addEventListener("click", (event) => {
    event.preventDefault();
    void app.open();
  });
  app.bind();
  void app.autoload();
}

class App implements DialogController {
  session: Session;
  namespaces: NamespaceInfo[];
  running = false;
  persisted = false;
  busy = false;
  dialog: Morebits_SimpleWindow_Instance | null = null;
  form: HTMLFormElement | null = null;
  private concealed = false;
  private readonly user: string;
  private readonly serverName: string;
  private toolsReady: Promise<void> | null = null;
  private tools: Awaited<ReturnType<typeof fetchAutoTools>> = [];

  constructor(user: string, serverName: string, dbName: string) {
    this.user = user;
    this.serverName = serverName;
    this.session = emptySession(`${dbName}:${user}`);
    this.namespaces = readNamespaces();
  }

  bind(): void {
    bindRowToggles((revid, checked, row) => this.toggle(revid, checked, row));
  }

  async autoload(): Promise<void> {
    const loaded = await loadSession(this.session.key);
    if (!loaded) return;
    this.session = loaded;
    this.persisted = true;
    this.refresh();
    this.open();
    if (
      this.session.step === 3 &&
      this.session.autoAdvance &&
      this.session.cleanup.auto
    ) {
      this.session.autoAdvance = false;
      void this.persist().then(() => runQueue(this.host()));
    }
  }

  open(): void {
    this.concealed = false;
    ensureDialog(this);
    this.refresh();
  }

  setForm(form: HTMLFormElement | null): void {
    this.form = form;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  refresh(): void {
    if (!this.concealed) {
      paintRows(this.session, this.session.step, (title) => {
        void openJob(this.host(), title);
      });
    }
    updateButtons(this);
  }

  conceal(): void {
    this.concealed = true;
    clearRowPaint();
  }

  async persist(): Promise<void> {
    await saveSession(this.session);
    this.persisted = true;
    updateButtons(this);
  }

  toggle(revid: number, checked: boolean, row: HTMLElement): void {
    const id = String(revid);
    this.session.highlights[id] = checked ? "manual" : "excluded";
    if (!this.session.metas[id]) {
      const meta = metaFromRow(row, this.namespaces);
      if (meta) this.session.metas[id] = meta;
    }
    void this.persist();
    this.refresh();
  }

  async applyFilters(
    config: FilterConfig,
    report: (text: string, type: string) => void,
  ): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    updateButtons(this);
    try {
      await this.ensureTools();
      const contribs = await fetchContributions(this.user, config, (count) => {
        report(`${count} edits fetched`, "status");
      });
      const created = config.excludeFollowups
        ? await titlesCreatedBy(this.user, config.namespaces)
        : undefined;
      if (created) {
        for (const contrib of contribs) {
          if (contrib.isNew) created.add(contrib.title);
        }
      }
      const matched = contribs.filter((contrib) =>
        matchContrib(contrib, config, this.tools, created),
      );
      this.session.highlights = mergeHighlights(
        this.session.highlights,
        matched.map((contrib) => contrib.revid),
      );
      for (const id of Object.keys(this.session.metas)) {
        if (!this.session.highlights[id]) delete this.session.metas[id];
      }
      for (const contrib of matched) {
        this.session.metas[String(contrib.revid)] = {
          title: contrib.title,
          timestamp: contrib.timestamp,
          isNew: contrib.isNew,
          pageid: contrib.pageid,
          ns: contrib.ns,
        };
      }
      this.session.filters = config;
      await this.persist();
      this.refresh();
      report(`Marked ${matched.length} revisions`, "info");
    } finally {
      this.busy = false;
      updateButtons(this);
    }
  }

  async cancel(): Promise<void> {
    const confirmed = window.confirm(
      `Delete saved highlights, settings, and cleanup progress for ${this.user}?`,
    );
    if (!confirmed) return;
    this.running = false;
    this.session.autoAdvance = false;
    await deleteSession(this.session.key);
    this.session = emptySession(this.session.key);
    this.persisted = false;
    clearRowPaint();
    this.open();
  }

  async advance(cleanup: CleanupConfig | null): Promise<void> {
    if (this.session.step === 1) {
      this.session.step = 2;
      this.session.position = null;
      await this.persist();
      if (this.goToLatestEdit()) return;
      this.open();
      this.reposition();
      return;
    }
    if (cleanup) this.session.cleanup = cleanup;
    syncJobs(this.session);
    this.session.step = 3;
    this.session.position = null;
    await this.persist();
    this.open();
    this.reposition();
    void runQueue(this.host());
  }

  async saveCleanup(cleanup: CleanupConfig): Promise<void> {
    this.session.cleanup = cleanup;
    await this.persist();
  }

  previous(): void {
    this.running = false;
    this.session.autoAdvance = false;
    this.session.step = this.session.step === 3 ? 2 : 1;
    this.session.position = null;
    void this.persist().then(() => {
      this.open();
      this.reposition();
    });
  }

  resume(): void {
    void runQueue(this.host());
  }

  pause(): void {
    this.running = false;
    updateButtons(this);
  }

  async finish(): Promise<void> {
    this.running = false;
    this.session.autoAdvance = false;
    const key = this.session.key;
    this.dialog?.close(new Event("click"));
    await deleteSession(key);
    this.session = emptySession(key);
    this.persisted = false;
    this.conceal();
  }

  private reposition(): void {
    requestAnimationFrame(() => {
      resetDialogPosition(this);
      void this.persist();
    });
  }

  private goToLatestEdit(): boolean {
    const stamps: string[] = [];
    for (const [id, reason] of Object.entries(this.session.highlights)) {
      if (reason === "excluded") continue;
      const stamp = this.session.metas[id]?.timestamp;
      if (stamp) stamps.push(stamp);
    }
    const offset = offsetAfterLatest(stamps);
    if (!offset) return false;
    const url = new URL(location.href);
    if (url.searchParams.get("offset") === offset) return false;
    url.searchParams.set("offset", offset);
    location.assign(url.toString());
    return true;
  }

  private host(): CleanupHost {
    const app = this;
    return {
      user: app.user,
      get session() {
        return app.session;
      },
      get running() {
        return app.running;
      },
      setRunning: (running) => {
        app.running = running;
      },
      persist: () => app.persist(),
      refresh: () => app.refresh(),
    };
  }

  private async ensureTools(): Promise<void> {
    if (this.toolsReady) return this.toolsReady;
    this.toolsReady = fetchAutoTools(this.serverName)
      .then((tools) => {
        this.tools = tools;
      })
      .catch((error: unknown) => {
        this.toolsReady = null;
        throw error;
      });
    return this.toolsReady;
  }
}

function readNamespaces(): NamespaceInfo[] {
  const formatted = mw.config.get("wgFormattedNamespaces");
  if (!formatted || typeof formatted !== "object") {
    return [{ id: 0, name: "Main" }];
  }
  return Object.entries(formatted as Record<string, string>)
    .map(([id, name]) => ({ id: Number(id), name: name || "Main" }))
    .filter((ns) => Number.isFinite(ns.id) && ns.id >= 0)
    .sort((a, b) => a.id - b.id);
}

function targetUser(): string | null {
  const configured = mw.config.get("wgRelevantUserName");
  if (typeof configured === "string" && configured) return configured;
  const target = new URLSearchParams(location.search).get("target");
  if (target) return target.replace(/_/g, " ");
  const match = location.pathname.match(/Special:Contributions\/(.+)$/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]).replace(/_/g, " ");
}
