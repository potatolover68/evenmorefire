/** Half-open ranges of wikitext that are not article prose. */
export function nonProseSpans(text: string): Array<[number, number]> {
  return scanSpans(text, false);
}

/** Every balanced `{{...}}`, including infoboxes and inline templates. */
export function templateSpans(text: string): Array<[number, number]> {
  return scanSpans(text, true);
}

/** True when the template regions of two texts are not the same strings. */
export function templateChanged(before: string, after: string): boolean {
  const left = templateSpans(before).map(([start, end]) => before.slice(start, end));
  const right = templateSpans(after).map(([start, end]) => after.slice(start, end));
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return true;
  return false;
}

function scanSpans(
  text: string,
  templatesOnly: boolean,
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const stack: Frame[] = [];
  let i = 0;
  while (i < text.length) {
    const top = stack[stack.length - 1];
    if (top?.kind === "comment") {
      if (text.startsWith("-->", i)) {
        stack.pop();
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (top?.kind === "nowiki") {
      const close = /^<\/nowiki\s*>/i.exec(text.slice(i));
      if (close) {
        stack.pop();
        i += close[0].length;
        continue;
      }
      i += 1;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      stack.push({ kind: "comment", start: i });
      i += 4;
      continue;
    }
    const nowiki = /^<nowiki\b[^>]*>/i.exec(text.slice(i));
    if (nowiki) {
      stack.push({ kind: "nowiki", start: i });
      i += nowiki[0].length;
      continue;
    }
    if (
      top?.kind === "table" &&
      top.mode === "wiki" &&
      text.startsWith("|}", i)
    ) {
      stack.pop();
      if (!templatesOnly) spans.push([top.start, i + 2]);
      i += 2;
      continue;
    }
    const tableClose = /^<\/table\s*>/i.exec(text.slice(i));
    if (top?.kind === "table" && top.mode === "html" && tableClose) {
      stack.pop();
      if (!templatesOnly) spans.push([top.start, i + tableClose[0].length]);
      i += tableClose[0].length;
      continue;
    }
    const refClose = /^<\/ref\s*>/i.exec(text.slice(i));
    if (top?.kind === "ref" && refClose) {
      stack.pop();
      if (!templatesOnly) spans.push([top.start, i + refClose[0].length]);
      i += refClose[0].length;
      continue;
    }
    if (text.startsWith("}}", i) && top?.kind === "template") {
      stack.pop();
      if (templatesOnly || top.keep) spans.push([top.start, i + 2]);
      i += 2;
      continue;
    }
    if (text.startsWith("]]", i) && top?.kind === "link") {
      stack.pop();
      if (!templatesOnly && top.keep) spans.push([top.start, i + 2]);
      i += 2;
      continue;
    }
    if (text.startsWith("{|", i)) {
      stack.push({ kind: "table", start: i, mode: "wiki" });
      i += 2;
      continue;
    }
    const tableOpen = /^<table\b[^>]*>/i.exec(text.slice(i));
    if (tableOpen) {
      stack.push({ kind: "table", start: i, mode: "html" });
      i += tableOpen[0].length;
      continue;
    }
    const refOpen = /^<ref\b[^>]*>/i.exec(text.slice(i));
    if (refOpen) {
      if (refOpen[0].endsWith("/>")) {
        if (!templatesOnly) spans.push([i, i + refOpen[0].length]);
        i += refOpen[0].length;
        continue;
      }
      stack.push({ kind: "ref", start: i });
      i += refOpen[0].length;
      continue;
    }
    if (text.startsWith("{{", i)) {
      const name = templateName(text, i + 2);
      stack.push({
        kind: "template",
        start: i,
        keep: isBlockStart(text, i) || isStructuralTemplate(name),
      });
      i += 2;
      continue;
    }
    if (text.startsWith("[[", i)) {
      const name = linkName(text, i + 2);
      stack.push({
        kind: "link",
        start: i,
        keep: /^(?:category|file|image)\s*:/i.test(name),
      });
      i += 2;
      continue;
    }
    i += 1;
  }
  return mergeSpans(spans);
}

export function insideSpan(
  spans: readonly [number, number][],
  start: number,
  end: number,
): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid]![0] <= start) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && end <= spans[found]![1];
}

/** True when the non-prose regions of two texts are not the same strings. */
export function nonProseChanged(before: string, after: string): boolean {
  const left = sliceSpans(before);
  const right = sliceSpans(after);
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return true;
  return false;
}

interface Frame {
  kind: "comment" | "nowiki" | "table" | "template" | "ref" | "link";
  start: number;
  mode?: "wiki" | "html";
  keep?: boolean;
}

function templateName(text: string, at: number): string {
  let i = at;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  let name = "";
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "|" || ch === "}" || ch === "\n" || ch === "<") break;
    name += ch;
    i += 1;
  }
  return name
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^(?:safe)?subst:/, "")
    .trim();
}

function linkName(text: string, at: number): string {
  let i = at;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  let name = "";
  while (i < text.length && name.length < 40) {
    const ch = text[i]!;
    if (ch === "|" || ch === "]" || ch === "\n" || ch === "{" || ch === "<")
      break;
    name += ch;
    i += 1;
  }
  return name.trim();
}

function isBlockStart(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i -= 1;
  return i < 0 || text[i] === "\n";
}

function isStructuralTemplate(name: string): boolean {
  if (!name) return false;
  if (name.startsWith("infobox")) return true;
  if (name.includes("navbox") || name.includes("sidebar")) return true;
  if (name === "short description" || name === "shortdesc") return true;
  if (
    /^(?:about|distinguish|for|other uses|redirect|hatnote|main|see also|selfref|dablink)$/.test(
      name,
    )
  ) {
    return true;
  }
  if (name === "citation" || name.startsWith("cite ")) return true;
  return /^(?:harv|harvnb|harvtxt|sfn|sfnm|sfnp|efn|efnm|rp|r)$/.test(name);
}

function sliceSpans(text: string): string[] {
  return nonProseSpans(text).map(([start, end]) => text.slice(start, end));
}

function mergeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [[sorted[0]![0], sorted[0]![1]]];
  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i]!;
    const last = out[out.length - 1]!;
    if (span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([span[0], span[1]]);
  }
  return out;
}
