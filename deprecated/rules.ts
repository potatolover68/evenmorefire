import type {
  DeclaredPair,
  ParsedRevision,
  RegexpRule,
  TemplateHistory,
  TemplateRevision,
} from "./types.ts";
import { findTemplates } from "./wikitext.ts";

export type { DeclaredPair, ParsedRevision, RegexpRule } from "./types.ts";

interface EdgeAcc {
  from: string;
  to: string;
  weight: number;
  revids: number[];
}

interface RevisionInfo {
  /** Timestamp of `revid` (for citations). */
  timestamp: string;
  pairs: Set<string>;
  regexps: RegexpRule[];
  /** Same portion() weight used for pair edges. */
  weight: number;
}

export interface RuleModel {
  legal: Set<string>;
  edges: EdgeAcc[];
  byRevid: Map<number, RevisionInfo>;
}

export interface ResolvedParam {
  to: string;
  pairs: string[];
}

export interface ParsedRules {
  pairs: DeclaredPair[];
  regexps: RegexpRule[];
}

const META_PARAMS = new Set(["_category", "preview", "ignoreblank"]);
const REGEXP_KEY = /^_regexp[1-9][0-9]*$/i;
const INVOKE_NAMES = new Set([
  "#invoke:check for deprecated parameters",
  "#invoke:module:check for deprecated parameters",
]);
/** nowiki, noinclude, and HTML comments — ranges to skip while scanning. */
const PROTECTED =
  /<(nowiki|noinclude)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;

export function pairKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

/** True when the latest wikitext can produce renames/removals. */
export function hasRuleMachinery(rules: ParsedRules): boolean {
  return rules.pairs.length > 0 || rules.regexps.length > 0;
}

export function parseRevision(content: string): ParsedRules {
  const pairs: DeclaredPair[] = [];
  const regexps: RegexpRule[] = [];
  const skip = protectedRanges(content);
  for (const template of findTemplates(content)) {
    if (!isDeprecatedInvoke(template.name)) continue;
    if (rangeBlocked(template.start, skip)) continue;
    const parsed = invokeRules(content.slice(template.start, template.end));
    pairs.push(...parsed.pairs);
    regexps.push(...parsed.regexps);
  }
  pairs.push(...templateDataAliases(content));
  return { pairs, regexps };
}

export function legalNames(content: string): Set<string> {
  const names = new Set<string>();
  const data = templateData(content);
  if (data?.params && typeof data.params === "object") {
    for (const [key, spec] of Object.entries(
      data.params as Record<string, { aliases?: unknown }>,
    )) {
      if (key) names.add(key);
      if (!Array.isArray(spec?.aliases)) continue;
      for (const alias of spec.aliases)
        if (typeof alias === "string" && alias) names.add(alias);
    }
  }
  const skip = protectedRanges(content);
  for (const match of content.matchAll(
    /\{\{\{\s*([^{}|]+?)\s*(?:\||\}\})/g,
  )) {
    if (match.index != null && rangeBlocked(match.index, skip)) continue;
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return names;
}

/** Collapse consecutive revisions with identical rules; drop wikitext. */
export function compactHistory(
  title: string,
  revisions: readonly TemplateRevision[],
): TemplateHistory {
  if (revisions.length === 0) {
    return { title, tipRevid: null, legal: new Set(), revisions: [] };
  }
  const ordered = [...revisions].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.revid - b.revid,
  );
  const last = ordered[ordered.length - 1]!;
  const legal = legalNames(last.content);
  const collapsed: ParsedRevision[] = [];
  for (const rev of ordered) {
    const rules = parseRevision(rev.content);
    const prev = collapsed[collapsed.length - 1];
    if (prev && sameRules(prev, rules)) {
      collapsed[collapsed.length - 1] = {
        ...prev,
        revid: rev.revid,
        revisedAt: rev.timestamp,
      };
      continue;
    }
    collapsed.push({
      revid: rev.revid,
      timestamp: rev.timestamp,
      revisedAt: rev.timestamp,
      pairs: rules.pairs,
      regexps: rules.regexps,
    });
  }
  return {
    title,
    tipRevid: last.revid,
    legal,
    revisions: collapsed,
  };
}

export function weightModel(
  history: TemplateHistory | readonly TemplateRevision[],
  snippetTimestamp: number,
  now = Date.now(),
): RuleModel {
  const compact = isTemplateHistory(history)
    ? history
    : compactHistory("", history);
  const ordered = compact.revisions;
  const edges = new Map<string, EdgeAcc>();
  const byRevid = new Map<number, RevisionInfo>();

  for (let i = 0; i < ordered.length; i++) {
    const rev = ordered[i]!;
    const next = ordered[i + 1];
    const start = Date.parse(rev.timestamp);
    const end = next ? Date.parse(next.timestamp) : Math.max(now, start);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const weight = portion(start, end, snippetTimestamp, now);
    const keys = new Set(rev.pairs.map((pair) => pairKey(pair.from, pair.to)));
    byRevid.set(rev.revid, {
      timestamp: rev.revisedAt,
      pairs: keys,
      regexps: rev.regexps,
      weight,
    });
    for (const pair of rev.pairs)
      addEdge(edges, pair.from, pair.to, weight, rev.revid);
  }

  return {
    legal: new Set(compact.legal),
    edges: [...edges.values()],
    byRevid,
  };
}

export function resolveParam(
  model: RuleModel,
  name: string,
): ResolvedParam | null {
  const resolved = walk(model, name, new Set(), 0);
  if (!resolved || resolved.to === name) return null;
  return resolved;
}

export function citeRevision(
  model: RuleModel,
  pairs: readonly string[],
): { revid: number; timestamp: string } | null {
  if (pairs.length === 0) return null;
  const revisions = [...model.byRevid.entries()].sort((a, b) => b[0] - a[0]);
  const has = (info: RevisionInfo, pair: string): boolean => {
    if (info.pairs.has(pair)) return true;
    const split = pair.split("\0");
    const from = split[0] ?? "";
    const to = split[1] ?? "";
    return info.regexps.some(
      (rule) =>
        luaMatch(from, rule.find) &&
        luaGsub(from, rule.find, rule.replace) === to,
    );
  };
  for (const [revid, info] of revisions) {
    if (pairs.every((pair) => has(info, pair)))
      return { revid, timestamp: info.timestamp };
  }
  for (const [revid, info] of revisions) {
    if (pairs.some((pair) => has(info, pair)))
      return { revid, timestamp: info.timestamp };
  }
  return null;
}

function isTemplateHistory(
  value: TemplateHistory | readonly TemplateRevision[],
): value is TemplateHistory {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as TemplateHistory).revisions)
  );
}

export function sameRules(prev: ParsedRevision, next: ParsedRules): boolean {
  if (prev.pairs.length !== next.pairs.length) return false;
  if (prev.regexps.length !== next.regexps.length) return false;
  for (let i = 0; i < prev.pairs.length; i++) {
    const a = prev.pairs[i]!;
    const b = next.pairs[i]!;
    if (a.from !== b.from || a.to !== b.to) return false;
  }
  for (let i = 0; i < prev.regexps.length; i++) {
    const a = prev.regexps[i]!;
    const b = next.regexps[i]!;
    if (a.find !== b.find || a.replace !== b.replace) return false;
  }
  return true;
}

function addEdge(
  edges: Map<string, EdgeAcc>,
  from: string,
  to: string,
  weight: number,
  revid: number,
): void {
  if (weight <= 0 || !from) return;
  const key = pairKey(from, to);
  const acc = edges.get(key) ?? { from, to, weight: 0, revids: [] };
  acc.weight += weight;
  acc.revids.push(revid);
  edges.set(key, acc);
}

function portion(
  start: number,
  end: number,
  snippetTimestamp: number,
  now: number,
): number {
  const life = Math.max(0, end - start);
  if (end <= snippetTimestamp) return life;
  return Math.max(0, Math.min(end, now) - Math.max(start, snippetTimestamp));
}

function walk(
  model: RuleModel,
  name: string,
  seen: Set<string>,
  depth: number,
): ResolvedParam | null {
  if (seen.has(name) || depth > 8) return null;
  seen.add(name);
  if (depth > 0 && model.legal.has(name)) return { to: name, pairs: [] };
  const outgoing = outgoingEdges(model, name);
  const direct = outgoing.find(
    (edge) => edge.to === "" || model.legal.has(edge.to),
  );
  if (direct)
    return { to: direct.to, pairs: [pairKey(direct.from, direct.to)] };
  for (const edge of outgoing) {
    if (!edge.to) continue;
    const next = walk(model, edge.to, seen, depth + 1);
    if (next)
      return {
        to: next.to,
        pairs: [pairKey(edge.from, edge.to), ...next.pairs],
      };
  }
  const best = outgoing.find((edge) => edge.to !== "");
  if (!best) return null;
  const historical = new Set(outgoing.map((edge) => edge.to));
  const repaired = [...model.legal].filter(
    (legal) => historical.has(legal) && editDistance(best.to, legal) === 1,
  );
  if (repaired.length === 1) {
    const target = repaired[0]!;
    const edge = outgoing.find((item) => item.to === target) ?? best;
    return {
      to: target,
      pairs: [pairKey(name, target === edge.to ? edge.to : target)],
    };
  }
  return null;
}

function outgoingEdges(model: RuleModel, name: string): EdgeAcc[] {
  const extra = regexpEdges(model, name);
  return [...model.edges.filter((edge) => edge.from === name), ...extra].sort(
    (a, b) =>
      b.weight - a.weight ||
      Math.max(...b.revids, 0) - Math.max(...a.revids, 0),
  );
}

function regexpEdges(model: RuleModel, name: string): EdgeAcc[] {
  const grouped = new Map<string, EdgeAcc>();
  for (const [revid, info] of model.byRevid) {
    for (const rule of info.regexps) {
      if (!luaMatch(name, rule.find)) continue;
      const to = luaGsub(name, rule.find, rule.replace);
      if (!to || to === name) continue;
      const acc = grouped.get(to) ?? { from: name, to, weight: 0, revids: [] };
      // Match pair edges: weight by how long the era lasted, not by row count.
      acc.weight += info.weight;
      acc.revids.push(revid);
      grouped.set(to, acc);
    }
  }
  return [...grouped.values()];
}

function invokeRules(raw: string): ParsedRules {
  const inner = raw.slice(2, -2);
  const parts = splitPipes(inner);
  const pairs: DeclaredPair[] = [];
  const regexps: RegexpRule[] = [];
  for (let i = 1; i < parts.length; i++) {
    const match = /^(\s*)([^=|]+?)(\s*)=(.*)$/s.exec(parts[i] ?? "");
    if (!match) continue;
    const key = (match[2] ?? "").trim();
    const value = (match[4] ?? "").trim();
    if (!key || META_PARAMS.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "_remove") {
      for (const part of value.split(";")) {
        const name = part.trim();
        if (name) pairs.push({ from: name, to: "" });
      }
      continue;
    }
    if (REGEXP_KEY.test(key)) {
      if (!value.includes("=")) continue;
      const split = value.split(/\s*=\s*/);
      const find = (split[0] ?? "").trim();
      const replace = split.slice(1).join("=").trim();
      if (find) regexps.push({ find, replace });
      continue;
    }
    pairs.push({ from: key, to: value });
  }
  return { pairs, regexps };
}

function templateDataAliases(content: string): DeclaredPair[] {
  const data = templateData(content);
  if (!data?.params || typeof data.params !== "object") return [];
  const pairs: DeclaredPair[] = [];
  for (const [name, spec] of Object.entries(
    data.params as Record<string, { aliases?: unknown }>,
  )) {
    if (!Array.isArray(spec?.aliases)) continue;
    for (const alias of spec.aliases) {
      if (typeof alias === "string" && alias && alias !== name)
        pairs.push({ from: alias, to: name });
    }
  }
  return pairs;
}

function templateData(content: string): { params?: unknown } | null {
  const match = /<templatedata>([\s\S]*?)<\/templatedata>/i.exec(content);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as { params?: unknown };
  } catch {
    return null;
  }
}

function isDeprecatedInvoke(name: string): boolean {
  return INVOKE_NAMES.has(
    name.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " "),
  );
}

function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  PROTECTED.lastIndex = 0;
  for (const match of text.matchAll(PROTECTED)) {
    if (match.index == null) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function rangeBlocked(
  index: number,
  skip: ReadonlyArray<[number, number]>,
): boolean {
  for (const [start, end] of skip) {
    if (index >= start && index < end) return true;
  }
  return false;
}

function splitPipes(inner: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let link = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
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
    buf += ch ?? "";
  }
  parts.push(buf);
  return parts;
}

function editDistance(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length] ?? 0;
}

function luaPatternToJsSource(pattern: string): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "%") {
      const next = pattern[i + 1];
      if (next == null) {
        out += "%";
        i += 1;
        continue;
      }
      i += 2;
      if (next === "d") out += "\\d";
      else if (next === "a") out += "[A-Za-z]";
      else if (next === "w") out += "[A-Za-z0-9_]";
      else if (next === "s") out += "\\s";
      else if ("%.()+*-?[]^$".includes(next)) out += `\\${next}`;
      else out += next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    if (ch === ".") out += "[\\s\\S]";
    else if ("()?*+".includes(ch)) out += ch;
    else if (ch === "-") out += "\\-";
    else if (/[\\^$|{}]/.test(ch)) out += `\\${ch}`;
    else out += ch;
    i += 1;
  }
  return out;
}

function luaMatch(subject: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${luaPatternToJsSource(pattern)})$`).test(subject);
  } catch {
    return false;
  }
}

function luaGsub(
  subject: string,
  pattern: string,
  replacement: string,
): string {
  try {
    const js = replacement.replace(/%([1-9])/g, (_match, n: string) => `$${n}`);
    return subject.replace(
      new RegExp(`^(?:${luaPatternToJsSource(pattern)})$`),
      js,
    );
  } catch {
    return subject;
  }
}
