import { alignSides, type AlignedRow } from "./align.ts";

export interface PreparedReview {
  latestText: string;
  latestRevid: number;
  proposal: string;
  rows: AlignedRow[];
}

const MAX = 1;
const ready = new Map<string, PreparedReview>();
const order: string[] = [];
const inflight = new Map<string, Promise<PreparedReview>>();

function same(
  hit: PreparedReview,
  latestRevid: number | null,
  proposal: string,
): boolean {
  if (hit.proposal !== proposal) return false;
  return latestRevid == null || hit.latestRevid === latestRevid;
}

function remember(title: string, prepared: PreparedReview): void {
  const at = order.indexOf(title);
  if (at >= 0) order.splice(at, 1);
  order.push(title);
  ready.set(title, prepared);
  while (order.length > MAX) {
    const drop = order.shift();
    if (drop) ready.delete(drop);
  }
}

/** Diff the proposal while the queue is between pages, so opening review does not. */
export function scheduleReview(
  title: string,
  latestText: string,
  latestRevid: number,
  proposal: string,
): void {
  const existing = ready.get(title);
  if (
    existing &&
    existing.latestText === latestText &&
    same(existing, latestRevid, proposal)
  ) {
    return;
  }
  const promise = new Promise<PreparedReview>((resolve, reject) => {
    setTimeout(() => {
      try {
        const prepared = {
          latestText,
          latestRevid,
          proposal,
          rows: alignSides(latestText, proposal),
        };
        remember(title, prepared);
        resolve(prepared);
      } catch (error) {
        reject(error);
      } finally {
        if (inflight.get(title) === promise) inflight.delete(title);
      }
    }, 0);
  });
  inflight.set(title, promise);
  void promise.catch(() => {});
}

export function preparedReview(
  title: string,
  latestRevid: number | null,
  proposal: string,
): PreparedReview | null {
  const hit = ready.get(title);
  if (!hit || !same(hit, latestRevid, proposal)) return null;
  return hit;
}

export function reviewInflight(
  title: string,
  latestRevid: number | null,
  proposal: string,
): Promise<PreparedReview | null> {
  const pending = inflight.get(title);
  if (!pending) return Promise.resolve(null);
  return pending
    .then((hit) => (same(hit, latestRevid, proposal) ? hit : null))
    .catch(() => null);
}
