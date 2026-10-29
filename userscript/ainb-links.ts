const DIFF_HREF = /Special:Diff\/(\d+)/i;
const DIFF_QUERY = /[?&]diff=(\d+)/;

export function diffIdFromHref(href: string): number | null {
  const match = DIFF_HREF.exec(href) ?? DIFF_QUERY.exec(href);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export function diffIdsFromHrefs(hrefs: readonly string[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const href of hrefs) {
    const id = diffIdFromHref(href);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
