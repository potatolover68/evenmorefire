import type { Explanation, Pos } from "../scrubber/types.ts";

export function detailKey(details: readonly string[] | undefined): string {
  return details?.join("\n") ?? "";
}

/** Lightness step for each column. Same action and details share a step. */
export function columnVariants(
  notes: readonly { action: string; details?: string[] }[],
): number[] {
  const assigned = new Map<string, number>();
  const variants: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const key = `${note.action}\0${detailKey(note.details)}`;
    const known = assigned.get(key);
    if (known !== undefined) {
      variants.push(known);
      continue;
    }
    const prev = notes[i - 1];
    const variant =
      prev &&
      prev.action === note.action &&
      detailKey(prev.details) !== detailKey(note.details)
        ? (variants[i - 1] ?? 0) + 1
        : 0;
    assigned.set(key, variant);
    variants.push(variant);
  }
  return variants;
}

export function actionHue(action: string): number {
  let hash = 0;
  for (let i = 0; i < action.length; i++) {
    hash = (hash * 33 + action.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function columnColor(action: string, variant: number): string {
  const light = 42 + (variant % 5) * 9;
  return `hsl(${actionHue(action)} 62% ${light}%)`;
}

export const LANE_PX = 10;

export interface SpanNote {
  from: number;
  to: number;
  note: Explanation;
  variant: number;
}

export interface GutterMarker {
  from: number;
  to: number;
  lane: number;
  color: string;
  notes: SpanNote[];
}

/** Comments that cover the same rows share a marker. Others share a lane until they overlap. */
export function packMarkers(spans: readonly SpanNote[]): GutterMarker[] {
  const groups = new Map<string, GutterMarker>();
  for (const span of spans) {
    const key = `${span.from}:${span.to}`;
    const existing = groups.get(key);
    if (existing) {
      existing.notes.push(span);
      continue;
    }
    groups.set(key, {
      from: span.from,
      to: span.to,
      lane: 0,
      color: columnColor(span.note.action, span.variant),
      notes: [span],
    });
  }
  const markers = [...groups.values()].sort(
    (a, b) => a.from - b.from || a.to - b.to,
  );
  const laneEnds: number[] = [];
  for (const marker of markers) {
    let lane = laneEnds.findIndex((end) => end < marker.from);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(marker.to);
    } else {
      laneEnds[lane] = marker.to;
    }
    marker.lane = lane;
  }
  return markers;
}

export function laneCount(markers: readonly GutterMarker[]): number {
  return markers.reduce((max, marker) => Math.max(max, marker.lane + 1), 1);
}

/** Inclusive line numbers. An end parked at column 0 of the next line closes on the line before. */
export function inclusiveLines(
  start: Pos,
  end: Pos,
): { start: number; end: number } {
  const endLine =
    end[0] > start[0] && end[1] === 0 ? end[0] - 1 : Math.max(start[0], end[0]);
  return { start: start[0], end: Math.max(start[0], endLine) };
}
