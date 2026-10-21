import { findTemplates } from "../deprecated/wikitext.ts";

export function markArticleCompleted(
  wikitext: string,
  title: string,
): string | null {
  const wanted = plainTitle(title);
  const spans = findTemplates(wikitext).filter(
    (template) => plainTitle(template.name) === "aic article row",
  );
  let out = wikitext;
  let changed = false;
  for (const span of [...spans].reverse()) {
    const body = out.slice(span.start, span.end);
    const next = rewriteRow(body, wanted);
    if (next == null || next === body) continue;
    out = out.slice(0, span.start) + next + out.slice(span.end);
    changed = true;
  }
  return changed ? out : null;
}

function rewriteRow(body: string, wanted: string): string | null {
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
    if (isCompleted(parsed[named]!.value)) return body;
    const nextParams = params.slice();
    nextParams[named] = replaceNamed(params[named] ?? "");
    return wrap(name, nextParams);
  }
  const positional = parsed
    .map((param, index) => ({ param, index }))
    .filter((entry) => entry.param.key == null);
  const status = positional[1];
  if (status) {
    if (isCompleted(status.param.value)) return body;
    const nextParams = params.slice();
    nextParams[status.index] = replacePositional(params[status.index] ?? "");
    return wrap(name, nextParams);
  }
  return `${body.slice(0, -2)}|status=completed}}`;
}

function wrap(name: string, params: readonly string[]): string {
  return `{{${[name, ...params].join("|")}}}`;
}

function replaceNamed(raw: string): string {
  const eq = raw.indexOf("=");
  if (eq < 0) return raw;
  return `${raw.slice(0, eq + 1)}completed`;
}

function replacePositional(raw: string): string {
  const match = /^(\s*)[\s\S]*?(\s*)$/.exec(raw);
  return `${match?.[1] ?? ""}completed${match?.[2] ?? ""}`;
}

function isCompleted(value: string): boolean {
  return /^(completed|c)$/i.test(value.trim());
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
