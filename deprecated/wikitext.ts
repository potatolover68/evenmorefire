export interface ParamSpan {
  name: string;
  /** Absolute index of the `|` that introduces this parameter. */
  pipe: number;
  keyStart: number;
  keyEnd: number;
  /** Exclusive end of the parameter text, not including a following `|`. */
  valueEnd: number;
}

export interface TemplateSpan {
  name: string;
  start: number;
  end: number;
  params: ParamSpan[];
}

const PROTECTED = /<(nowiki)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;

export function isParserFunctionName(name: string): boolean {
  return name.trim().startsWith("#");
}

export function isMagicWordName(name: string): boolean {
  const colon = name.indexOf(":");
  if (colon < 1) return false;
  return /^[A-Z][A-Z_]*$/.test(name.slice(0, colon).trim());
}

export function isRewritableTemplateName(name: string): boolean {
  return !isParserFunctionName(name) && !isMagicWordName(name);
}

export function templatePageTitle(name: string): string {
  const cleaned = name.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (/^template:/i.test(cleaned)) {
    return `Template:${cleaned.slice(cleaned.indexOf(":") + 1).trim()}`;
  }
  if (cleaned.includes(":")) return cleaned;
  return `Template:${cleaned}`;
}

export function findTemplates(text: string): TemplateSpan[] {
  const skip = protectedRanges(text);
  const found: TemplateSpan[] = [];
  walk(text, 0, text.length, skip, found);
  return found;
}

function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of text.matchAll(PROTECTED)) {
    if (match.index == null) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function skipEnd(index: number, skip: Array<[number, number]>): number {
  for (const [start, end] of skip) {
    if (index >= start && index < end) return end;
  }
  return -1;
}

function walk(
  text: string,
  from: number,
  to: number,
  skip: Array<[number, number]>,
  out: TemplateSpan[],
): void {
  let i = from;
  while (i < to - 1) {
    const jumped = skipEnd(i, skip);
    if (jumped >= 0) {
      i = jumped;
      continue;
    }
    if (text[i] === "{" && text[i + 1] === "{") {
      const end = templateEnd(text, i);
      if (end < 0 || end > to) {
        i += 1;
        continue;
      }
      const described = describeTemplate(text, i, end);
      if (described) out.push(described);
      walk(text, i + 2, end - 2, skip, out);
      i = end;
      continue;
    }
    i += 1;
  }
}

function templateEnd(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length - 1) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth += 1;
      i += 2;
      continue;
    }
    if (text[i] === "}" && text[i + 1] === "}") {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return -1;
}

function describeTemplate(
  text: string,
  start: number,
  end: number,
): TemplateSpan | null {
  const inner = text.slice(start + 2, end - 2);
  const innerBase = start + 2;
  const parts: Array<{ text: string; start: number }> = [];
  let bufStart = 0;
  let depth = 0;
  let link = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "{" && inner[i + 1] === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" && inner[i + 1] === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (ch === "[" && inner[i + 1] === "[") {
      link += 1;
      i += 1;
      continue;
    }
    if (ch === "]" && inner[i + 1] === "]") {
      link = Math.max(0, link - 1);
      i += 1;
      continue;
    }
    if (ch === "|" && depth === 0 && link === 0) {
      parts.push({
        text: inner.slice(bufStart, i),
        start: innerBase + bufStart,
      });
      bufStart = i + 1;
    }
  }
  parts.push({ text: inner.slice(bufStart), start: innerBase + bufStart });
  const name = (parts[0]?.text ?? "").trim();
  if (!name) return null;
  const params: ParamSpan[] = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    const match = /^(\s*)([^=|]+?)(\s*)=(.*)$/s.exec(part.text);
    if (!match) continue;
    const rawName = match[2] ?? "";
    const keyStart = part.start + (match[1]?.length ?? 0);
    const pipeAt = part.start - 1;
    params.push({
      name: rawName.trim(),
      keyStart,
      keyEnd: keyStart + rawName.length,
      pipe: text[pipeAt] === "|" ? pipeAt : part.start,
      valueEnd: part.start + part.text.length,
    });
  }
  return { name, start, end, params };
}

export function removalRange(
  text: string,
  param: ParamSpan,
): { start: number; end: number } {
  let end = param.valueEnd;
  if (text[end] === "\r") end += 1;
  if (text[end] === "\n") end += 1;
  return { start: param.pipe, end };
}
