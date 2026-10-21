<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Explanation } from "../../scrubber/types.ts";
import { indexLines, visualSpanIndexed, type AlignedRow } from "../align.ts";
import { actionPieces } from "../comments.ts";
import {
  columnVariants,
  inclusiveLines,
  laneCount,
  LANE_PX,
  packMarkers,
  type GutterMarker,
} from "../gutter.ts";
import {
  charsAcross,
  heightPrefix,
  LINE_PX,
  rowAt,
  rowHeights,
} from "../rows.ts";
import { previewWikitext } from "../mediawiki.ts";
import type { ReviewActions, ReviewState } from "./state.ts";

const props = defineProps<{
  state: ReviewState;
  actions: ReviewActions;
}>();

const root = ref<HTMLElement | null>(null);
const beforePane = ref<HTMLElement | null>(null);
const afterPane = ref<HTMLElement | null>(null);
const gutterPane = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewHeight = ref(720);
const paneWidth = ref(0);
const charPx = ref(8);
const hovering = ref<GutterMarker | null>(null);
const panelTop = ref(8);
const panelLeft = ref(8);
const showPreview = ref(false);
const previewing = ref(false);
const previewBox = ref<HTMLElement | null>(null);
let previewed = "";
let lock = false;
let observer: ResizeObserver | null = null;

const reviewable = computed(() =>
  ["processed", "flagged", "review"].includes(props.state.status),
);
const rows = computed(() => props.state.rows ?? []);
const chars = computed(() => charsAcross(paneWidth.value, charPx.value));
const heights = computed(() => rowHeights(rows.value, chars.value));
const prefix = computed(() => heightPrefix(heights.value));
const total = computed(() => prefix.value[prefix.value.length - 1] ?? 0);
const markers = computed(() => {
  const list = rows.value;
  const before = indexLines(list, "beforeLine");
  const after = indexLines(list, "afterLine");
  const variants = columnVariants(props.state.explanations);
  return packMarkers(
    props.state.explanations.map((note, index) => {
      const latest = note.latestStart && note.latestEnd;
      const lines = latest
        ? inclusiveLines(note.latestStart!, note.latestEnd!)
        : inclusiveLines(note.start, note.end);
      const span = visualSpanIndexed(
        latest ? before : after,
        lines.start,
        lines.end,
      );
      return {
        from: span.from,
        to: span.to,
        note,
        variant: variants[index] ?? 0,
      };
    }),
  );
});
const gutterWidth = computed(() => laneCount(markers.value) * LANE_PX);
const visible = computed(() => {
  const list = rows.value;
  if (list.length === 0) return [];
  const top = scrollTop.value;
  const view = viewHeight.value || 720;
  const start = Math.max(0, rowAt(prefix.value, Math.max(0, top - 240)));
  const end = Math.min(list.length, rowAt(prefix.value, top + view + 240) + 1);
  const slice: Array<{ index: number; row: AlignedRow }> = [];
  for (let i = start; i < end; i++) slice.push({ index: i, row: list[i]! });
  return slice;
});
const highlight = computed(() =>
  hovering.value ? { from: hovering.value.from, to: hovering.value.to } : null,
);

function lineStyle(index: number): { top: string; height: string } {
  return {
    top: `${prefix.value[index] ?? 0}px`,
    height: `${heights.value[index] ?? LINE_PX}px`,
  };
}

function lineClass(index: number, side: "before" | "after", row: AlignedRow) {
  const mark = highlight.value;
  return {
    del: side === "before" && row.before != null && row.after == null,
    add: side === "after" && row.after != null && row.before == null,
    hit: mark != null && index >= mark.from && index <= mark.to,
  };
}

function barStyle(marker: GutterMarker): Record<string, string> {
  const top = prefix.value[marker.from] ?? 0;
  const bottom = prefix.value[marker.to + 1] ?? top + LINE_PX;
  return {
    top: `${top}px`,
    height: `${Math.max(LINE_PX, bottom - top)}px`,
    left: `${marker.lane * LANE_PX + 1}px`,
    width: `${LANE_PX - 2}px`,
    background: marker.color,
  };
}

function pieces(note: Explanation) {
  return actionPieces(note.action, note.details, props.state.origin);
}

function where(note: Explanation): string {
  const lines =
    note.latestStart && note.latestEnd
      ? inclusiveLines(note.latestStart, note.latestEnd)
      : inclusiveLines(note.start, note.end);
  return `lines ${lines.start + 1}–${lines.end + 1}`;
}

function hasClosest(node: EventTarget | null): node is Element {
  return !!node && typeof node === "object" && "closest" in node;
}

function showMarker(marker: GutterMarker, event: MouseEvent): void {
  hovering.value = marker;
  const target = event.currentTarget;
  if (!hasClosest(target)) return;
  const rect = target.getBoundingClientRect();
  const view = root.value?.ownerDocument.defaultView;
  const limit = view?.innerHeight ?? rect.bottom;
  panelTop.value = Math.min(Math.max(8, rect.top), Math.max(8, limit - 160));
  panelLeft.value = Math.max(8, rect.left - 288);
}

function hideMarker(event: MouseEvent): void {
  const next = event.relatedTarget;
  if (hasClosest(next) && (next.closest(".bar") || next.closest(".panel"))) {
    return;
  }
  hovering.value = null;
}

function onScroll(event: Event): void {
  const source = event.currentTarget;
  if (!hasClosest(source) || lock) return;
  lock = true;
  scrollTop.value = source.scrollTop;
  for (const el of [beforePane.value, gutterPane.value, afterPane.value]) {
    if (el && el !== source) el.scrollTop = source.scrollTop;
  }
  lock = false;
}

function remeasure(): void {
  const pane = beforePane.value;
  if (!pane) return;
  const probe = pane.ownerDocument.createElement("span");
  probe.textContent = "00000000";
  probe.style.cssText =
    "position:absolute;visibility:hidden;font:13px monospace;white-space:pre;";
  pane.append(probe);
  const width = probe.getBoundingClientRect().width / 8;
  probe.remove();
  if (width > 0) charPx.value = width;
  paneWidth.value = pane.clientWidth;
  viewHeight.value = pane.clientHeight || 720;
}

function attachObserver(): void {
  observer?.disconnect();
  const pane = beforePane.value;
  if (!pane || typeof ResizeObserver === "undefined") {
    remeasure();
    return;
  }
  observer = new ResizeObserver(() => remeasure());
  observer.observe(pane);
  remeasure();
}

async function run(
  action: (content: string) => Promise<void>,
  done: string,
): Promise<void> {
  try {
    await action(
      props.state.editing ? props.state.draft : props.state.proposal,
    );
    props.state.statusText = done;
    props.state.done = true;
  } catch (error) {
    props.state.statusText =
      error instanceof Error ? error.message : String(error);
  }
}

function modify(): void {
  if (!props.state.editing) props.state.draft = props.state.proposal;
  props.state.editing = true;
}

function proposalText(): string {
  return props.state.editing ? props.state.draft : props.state.proposal;
}

async function previewEdit(): Promise<void> {
  const text = proposalText();
  if (showPreview.value && previewed === text) {
    showPreview.value = false;
    return;
  }
  previewing.value = true;
  props.state.statusText = "Loading preview…";
  try {
    const html = await previewWikitext(props.state.title, text);
    const box = previewBox.value;
    if (!box) return;
    box.innerHTML = html;
    const origin = props.state.origin.replace(/\/$/, "");
    for (const link of box.querySelectorAll("a")) {
      link.target = "_blank";
      const href = link.getAttribute("href");
      if (href && href.startsWith("/")) link.href = origin + href;
    }
    previewed = text;
    showPreview.value = true;
    props.state.statusText = "";
  } catch (error) {
    showPreview.value = false;
    props.state.statusText =
      error instanceof Error ? error.message : String(error);
  } finally {
    previewing.value = false;
  }
}

function exportEdit(): void {
  const doc = root.value?.ownerDocument ?? document;
  const payload = {
    timestamp: new Date().toISOString(),
    latestRevid: props.state.latestRevid,
    content: props.state.editing ? props.state.draft : props.state.proposal,
    taintedRevids: props.state.taintedRevids,
    comments: props.state.explanations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const anchor = doc.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `emf-${props.state.title.replace(/[^\w]+/g, "_")}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

watch(
  () => props.state.rows,
  async () => {
    scrollTop.value = 0;
    hovering.value = null;
    showPreview.value = false;
    previewed = "";
    if (previewBox.value) previewBox.value.innerHTML = "";
    await nextTick();
    for (const el of [beforePane.value, gutterPane.value, afterPane.value]) {
      if (el) el.scrollTop = 0;
    }
    remeasure();
  },
);

onMounted(() => attachObserver());
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="shell">
    <p v-for="warning in state.warnings" :key="warning" class="warn">
      {{ warning }}
    </p>
    <div v-if="state.failed" class="view pending">{{ state.failed }}</div>
    <div v-else-if="!state.rows" class="view pending">Preparing diff…</div>
    <div v-else class="view">
      <div ref="beforePane" class="pane" @scroll="onScroll">
        <div class="spacer" :style="{ height: total + 'px' }">
          <div
            v-for="item in visible"
            :key="'b' + item.index"
            class="line"
            :class="lineClass(item.index, 'before', item.row)"
            :style="lineStyle(item.index)"
          >
            {{ item.row.before ?? "" }}
          </div>
        </div>
      </div>
      <div
        ref="gutterPane"
        class="gutter-scroll"
        :style="{ width: gutterWidth + 'px' }"
        @scroll="onScroll"
      >
        <div
          class="gutter"
          :style="{ height: total + 'px', width: gutterWidth + 'px' }"
        >
          <div
            v-for="marker in markers"
            :key="marker.from + ':' + marker.to + ':' + marker.lane"
            class="bar"
            :style="barStyle(marker)"
            @mouseenter="showMarker(marker, $event)"
            @mouseleave="hideMarker"
          ></div>
        </div>
      </div>
      <div ref="afterPane" class="pane" @scroll="onScroll">
        <div class="spacer" :style="{ height: total + 'px' }">
          <div
            v-for="item in visible"
            :key="'a' + item.index"
            class="line"
            :class="lineClass(item.index, 'after', item.row)"
            :style="lineStyle(item.index)"
          >
            {{ item.row.after ?? "" }}
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="hovering"
      class="panel"
      :style="{ top: panelTop + 'px', left: panelLeft + 'px' }"
      @mouseleave="hideMarker"
    >
      <div v-for="(span, index) in hovering.notes" :key="index">
        <template
          v-for="(piece, pieceIndex) in pieces(span.note)"
          :key="pieceIndex"
        >
          <a v-if="piece.href" :href="piece.href" target="_blank">{{
            piece.text
          }}</a>
          <span v-else>{{ piece.text }}</span>
        </template>
        <div class="where">{{ where(span.note) }}</div>
      </div>
    </div>
    <textarea
      v-show="state.editing"
      v-model="state.draft"
      class="editor"
    ></textarea>
    <div v-show="showPreview" ref="previewBox" class="preview"></div>
    <p class="status">{{ state.statusText }}</p>
    <div class="bar-row">
      <template v-if="reviewable">
        <button
          type="button"
          :disabled="state.done"
          @click="run(actions.apply, 'Applied.')"
        >
          Apply
        </button>
        <button type="button" :disabled="state.done" @click="modify">
          Modify
        </button>
        <button
          type="button"
          :disabled="state.done"
          @click="run(actions.reject, 'Skipped.')"
        >
          Reject
        </button>
      </template>
      <button
        v-if="state.status === 'applied'"
        type="button"
        :disabled="state.done"
        @click="
          run(actions.undo, 'Undone. Revision-deleted text stays hidden.')
        "
      >
        Undo
      </button>
      <button type="button" :disabled="previewing" @click="previewEdit">
        {{ showPreview ? "Hide preview" : "Preview" }}
      </button>
      <button type="button" @click="exportEdit">Export edit</button>
    </div>
  </div>
</template>
