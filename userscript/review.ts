import { createApp, reactive, type App } from "vue";
import { alignSides, type AlignedRow } from "./align.ts";
import ReviewApp from "./review/ReviewApp.vue";
import reviewCss from "./review/review.css?inline";
import type { ReviewActions, ReviewState } from "./review/state.ts";
import type { Explanation } from "../scrubber/types.ts";
import type { JobStatus } from "./types.ts";

export interface ReviewRequest {
  title: string;
  latestText: string;
  latestRevid: number;
  baseRevid: number | null;
  proposal: string;
  explanations: Explanation[];
  taintedRevids: number[];
  status: JobStatus;
  origin: string;
  revdel: boolean;
  onApply: (content: string) => Promise<void>;
  onReject: () => Promise<void>;
  onUndo: () => Promise<void>;
  /** Diff prepared while the page was processed. */
  rows?: readonly AlignedRow[];
}

export interface ReviewHandle {
  show(
    latestText: string,
    latestRevid: number,
    rows?: readonly AlignedRow[],
  ): void;
  noteMoved(latestRevid: number): void;
  fail(message: string): void;
}

const noopHandle: ReviewHandle = {
  show() {},
  noteMoved() {},
  fail() {},
};

const POPUP_NAME = "emf-review";

let generation = 0;
let current: {
  popup: Window;
  app: App;
  state: ReviewState;
  actions: ReviewActions;
} | null = null;

export function openReview(request: ReviewRequest): ReviewHandle {
  const gen = ++generation;
  const live = current && !current.popup.closed ? current : null;
  if (live && unsaved(live.state)) {
    const replace = live.popup.confirm(
      "This review has unsaved modifications. Replace it?",
    );
    if (!replace) {
      generation = gen - 1;
      live.popup.focus();
      return noopHandle;
    }
  }

  let popup = live?.popup ?? null;
  if (!popup) {
    current = null;
    popup = window.open("", POPUP_NAME, "width=1100,height=760");
    if (!popup) return noopHandle;
    writeShell(popup, request.title);
    const state = makeState(request);
    const actions: ReviewActions = {
      apply: request.onApply,
      reject: request.onReject,
      undo: request.onUndo,
    };
    const app = createApp(ReviewApp, { state, actions });
    app.mount(popup.document.body);
    current = { popup, app, state, actions };
    return handleFor(popup, state, request, gen);
  }

  popup.focus();
  popup.document.title = request.title;
  if (!live) return noopHandle;
  fillState(live.state, request);
  live.actions.apply = request.onApply;
  live.actions.reject = request.onReject;
  live.actions.undo = request.onUndo;
  return handleFor(popup, live.state, request, gen);
}

function unsaved(state: ReviewState): boolean {
  return state.editing && !state.done && state.draft !== state.proposal;
}

function makeState(request: ReviewRequest): ReviewState {
  const state = reactive<ReviewState>({
    title: "",
    latestText: "",
    latestRevid: 0,
    baseRevid: null,
    proposal: "",
    explanations: [],
    taintedRevids: [],
    status: request.status,
    origin: request.origin,
    rows: null,
    warnings: [],
    statusText: "",
    editing: false,
    draft: "",
    done: false,
    failed: "",
  });
  fillState(state, request);
  return state;
}

function fillState(state: ReviewState, request: ReviewRequest): void {
  state.rows = null;
  state.latestText = "";
  state.proposal = "";
  state.draft = "";
  state.explanations = [];
  state.warnings = [];
  state.title = request.title;
  state.latestText = request.latestText;
  state.latestRevid = request.latestRevid;
  state.baseRevid = request.baseRevid;
  state.proposal = request.proposal;
  state.explanations = request.explanations;
  state.taintedRevids = request.taintedRevids;
  state.status = request.status;
  state.origin = request.origin;
  state.rows = request.rows ?? null;
  state.statusText = "";
  state.editing = false;
  state.done = false;
  state.failed = "";
  state.draft = request.proposal;
  if (request.revdel && request.status === "applied") {
    state.warnings.push("Undo does not restore revision-deleted text.");
  }
}

function writeShell(popup: Window, title: string): void {
  const doc = popup.document;
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body></body></html>`,
  );
  doc.close();
  const style = doc.createElement("style");
  style.textContent = reviewCss;
  doc.head.append(style);
}

function handleFor(
  popup: Window,
  state: ReviewState,
  request: ReviewRequest,
  gen: number,
): ReviewHandle {
  return {
    show(text, revid, rows) {
      if (gen !== generation || popup.closed) return;
      state.latestText = text;
      state.latestRevid = revid;
      state.failed = "";
      state.rows = null;
      state.rows = rows ?? alignSides(text, state.proposal);
      if (request.baseRevid != null && request.baseRevid !== revid) {
        pushWarning(
          state,
          `The page has moved past revision ${request.baseRevid}. This diff is against the current latest revision.`,
        );
      }
    },
    noteMoved(liveRevid) {
      if (
        gen !== generation ||
        popup.closed ||
        liveRevid === state.latestRevid
      ) {
        return;
      }
      pushWarning(
        state,
        `The page has changed since this was processed (now revision ${liveRevid}). This diff is against revision ${state.latestRevid}.`,
      );
    },
    fail(message) {
      if (gen !== generation || popup.closed) return;
      state.failed = message;
      state.rows = null;
    },
  };
}

function pushWarning(state: ReviewState, text: string): void {
  if (!state.warnings.includes(text)) state.warnings.push(text);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
