import type { FilterConfig, HighlightReason } from "./types.ts";

export interface Contrib {
  revid: number;
  title: string;
  timestamp: string;
  comment: string;
  sizediff: number;
  tags: string[];
  ns: number;
  isNew: boolean;
  pageid: number | null;
}

export interface AutoTool {
  tags: string[];
  regex: string | null;
  revert: string | null;
  namespaces: number[] | null;
  tagExcludes: string[];
}

export function defaultFilters(): FilterConfig {
  return {
    minBytes: null,
    maxBytes: null,
    after: null,
    before: null,
    excludeAuto: false,
    excludeCreations: false,
    excludeFollowups: false,
    includeCreations: false,
    summaryRegex: "",
    summaryCaseSensitive: false,
    namespaces: [0],
  };
}

export function regexProblem(source: string): string | null {
  if (!source) return null;
  try {
    new RegExp(source);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid regular expression";
  }
}

export function serializeFilters(config: FilterConfig): string {
  return JSON.stringify({
    ...config,
    namespaces: config.namespaces
      ? [...config.namespaces].sort((a, b) => a - b)
      : null,
  });
}

export function sameFilters(a: FilterConfig | null, b: FilterConfig): boolean {
  if (!a) return false;
  return serializeFilters(a) === serializeFilters(b);
}

export function matchContrib(
  contrib: Contrib,
  config: FilterConfig,
  tools: readonly AutoTool[],
  createdTitles?: ReadonlySet<string>,
): boolean {
  const bytes = contrib.sizediff;
  if (config.minBytes != null && bytes < config.minBytes) return false;
  if (config.maxBytes != null && bytes > config.maxBytes) return false;
  const at = Date.parse(contrib.timestamp);
  if (config.after && !(at >= Date.parse(config.after))) return false;
  if (config.before && !(at <= Date.parse(config.before))) return false;
  if (config.namespaces && !config.namespaces.includes(contrib.ns)) {
    return false;
  }
  if (config.summaryRegex) {
    try {
      const flags = config.summaryCaseSensitive ? "" : "i";
      if (!new RegExp(config.summaryRegex, flags).test(contrib.comment)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  if (config.excludeAuto && isAutomated(contrib, tools)) return false;
  if (config.excludeCreations && contrib.isNew) return false;
  if (
    config.excludeFollowups &&
    !contrib.isNew &&
    createdTitles?.has(contrib.title)
  ) {
    return false;
  }
  if (config.includeCreations && !contrib.isNew) return false;
  return true;
}

export function isAutomated(
  contrib: Contrib,
  tools: readonly AutoTool[],
): boolean {
  for (const tool of tools) {
    if (tool.namespaces && !tool.namespaces.includes(contrib.ns)) continue;
    if (tool.tagExcludes.some((tag) => contrib.tags.includes(tag))) continue;
    if (tool.tags.some((tag) => contrib.tags.includes(tag))) return true;
    if (tool.regex && testPattern(tool.regex, contrib.comment)) return true;
    if (tool.revert && testPattern(tool.revert, contrib.comment)) return true;
  }
  return false;
}

export function toolsForWiki(json: unknown, serverName: string): AutoTool[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const tools: AutoTool[] = [];
  for (const bucket of [root.global, root[serverName]]) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const value of Object.values(bucket as Record<string, unknown>)) {
      const tool = asTool(value);
      if (tool) tools.push(tool);
    }
  }
  return tools;
}

export function mergeHighlights(
  previous: Record<string, HighlightReason>,
  matched: readonly number[],
): Record<string, HighlightReason> {
  const next: Record<string, HighlightReason> = {};
  for (const [id, reason] of Object.entries(previous)) {
    if (reason === "manual" || reason === "excluded") next[id] = reason;
  }
  for (const id of matched) {
    const key = String(id);
    if (next[key] === "manual" || next[key] === "excluded") continue;
    next[key] = "filters";
  }
  return next;
}

function testPattern(source: string, comment: string): boolean {
  try {
    return new RegExp(source).test(comment);
  } catch {
    return false;
  }
}

function asTool(value: unknown): AutoTool | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tags = stringList(record.tags);
  const regex = typeof record.regex === "string" ? record.regex : null;
  const revert = typeof record.revert === "string" ? record.revert : null;
  if (tags.length === 0 && !regex && !revert) return null;
  const namespaces = numberList(record.namespaces);
  return {
    tags,
    regex,
    revert,
    namespaces,
    tagExcludes: stringList(record.tag_excludes ?? record.tagExcludes),
  };
}

function stringList(value: unknown): string[] {
  if (typeof value === "string" && value) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function numberList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const numbers = value.filter(
    (item): item is number => typeof item === "number",
  );
  return numbers.length > 0 ? numbers : null;
}
