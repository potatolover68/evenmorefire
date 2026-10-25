import { findTemplates } from "../deprecated/wikitext.ts";

export type RowStatus = "completed" | "ongoing" | "unnecessary" | "tagged";

export function markArticleCompleted(
  wikitext: string,
  title: string,
  status: RowStatus = "completed",
): string | null {
  const wanted = plainTitle(title);
  const spans = findTemplates(wikitext).filter(
    (template) => plainTitle(template.name) === "aic article row",
  );
  let out = wikitext;
  let changed = false;
  for (const span of [...spans].reverse()) {
    const body = out.slice(span.start, span.end);
    const next = rewriteRow(body, wanted, status);
    if (next == null || next === body) continue;
    out = out.slice(0, span.start) + next + out.slice(span.end);
    changed = true;
  }
  return changed ? out : null;
}

function rewriteRow(
  body: string,
  wanted: string,
  status: RowStatus,
): string | null {
  if (!body.startsWith("{{") || !body.endsWith("}}")) return null;
  const inner = body.slice(2, -2);
  const parts = splitTop(inner);
  const name = parts[0] ?? "";
  const params = parts.slice(1);
  const parsed = params.map(parseParam);
  const article =
    parsed.find((param) => param.key === "article" || param.key === "1")
      ?.value ?? parsed.find((param) => param.key == null)?.value;
  if (article == null || plainTitle(article) !== wanted) return null;

  const named = parsed.findIndex(
    (param) => param.key === "status" || param.key === "2",
  );
  if (named >= 0) {
    if (statusRank(parsed[named]!.value) >= statusRank(status)) return body;
    const nextParams = params.slice();
    nextParams[named] = replaceNamed(params[named] ?? "", status);
    return wrap(name, nextParams);
  }
  const positional = parsed
    .map((param, index) => ({ param, index }))
    .filter((entry) => entry.param.key == null);
  const slot = positional[1];
  if (slot) {
    if (statusRank(slot.param.value) >= statusRank(status)) return body;
    const nextParams = params.slice();
    nextParams[slot.index] = replacePositional(params[slot.index] ?? "", status);
    return wrap(name, nextParams);
  }
  return `${body.slice(0, -2)}|status=${status}}}`;
}

function wrap(name: string, params: readonly string[]): string {
  return `{{${[name, ...params].join("|")}}}`;
}

function replaceNamed(raw: string, status: RowStatus): string {
  const eq = raw.indexOf("=");
  if (eq < 0) return raw;
  return `${raw.slice(0, eq + 1)}${status}`;
}

function replacePositional(raw: string, status: RowStatus): string {
  const match = /^(\s*)[\s\S]*?(\s*)$/.exec(raw);
  return `${match?.[1] ?? ""}${status}${match?.[2] ?? ""}`;
}

/**
 * A finished cleanup outranks an unneeded one, which outranks a prod
 * (`ongoing`), which outranks an AI tag. Open rows stay at the bottom.
 */
function statusRank(value: string): number {
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (text === "completed" || text === "c") return 4;
  if (text === "unnecessary" || text === "u" || text === "unneeded") return 3;
  if (text === "ongoing" || text === "o" || text === "in progress") return 2;
  if (text === "tagged" || text === "tag" || text === "tg") return 1;
  return 0;
}

function parseParam(raw: string): { key: string | null; value: string } {
  let depth = 0;
  let link = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{" && raw[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" && raw[i + 1] === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (ch === "[" && raw[i + 1] === "[") {
      link += 1;
      i += 1;
      continue;
    }
    if (ch === "]" && raw[i + 1] === "]") {
      link = Math.max(0, link - 1);
      i += 1;
      continue;
    }
    if (ch !== "=" || depth !== 0 || link !== 0) continue;
    const key = raw.slice(0, i).trim().toLowerCase();
    if (!key) return { key: null, value: raw.trim() };
    return { key, value: raw.slice(i + 1).trim() };
  }
  return { key: null, value: raw.trim() };
}

function splitTop(inner: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let link = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "{" && inner[i + 1] === "{") {
      depth += 1;
      buf += "{{";
      i += 1;
      continue;
    }
    if (ch === "}" && inner[i + 1] === "}") {
      depth = Math.max(0, depth - 1);
      buf += "}}";
      i += 1;
      continue;
    }
    if (ch === "[" && inner[i + 1] === "[") {
      link += 1;
      buf += "[[";
      i += 1;
      continue;
    }
    if (ch === "]" && inner[i + 1] === "]") {
      link = Math.max(0, link - 1);
      buf += "]]";
      i += 1;
      continue;
    }
    if (ch === "|" && depth === 0 && link === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

export function plainTitle(value: string): string {
  const trimmed = value.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  const linked = /^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/.exec(trimmed);
  return (linked?.[1] ?? trimmed).trim().toLowerCase();
}
