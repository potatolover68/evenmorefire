const MULTI = ["<!--", "-->", "[[", "]]", "{{", "}}"] as const;

export interface SplitToken {
  value: string;
  start: number;
  end: number;
  gapAfter: string;
}

export interface SplitSentence {
  key: string;
  tokens: SplitToken[];
}

export interface SplitParagraph {
  key: string;
  sentences: SplitSentence[];
}

export interface SplitDoc {
  leadingGap: string;
  paragraphs: SplitParagraph[];
}

interface CachedToken {
  value: string;
  relStart: number;
  relEnd: number;
  gapAfter: string;
}

interface CachedSentence {
  key: string;
  tokens: CachedToken[];
}

interface CachedParagraph {
  sentences: CachedSentence[];
}

const paragraphCache = new Map<string, CachedParagraph>();

export function normalizeNewlines(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

export interface ParaSpan {
  key: string;
  /** Absolute offset of the trimmed paragraph key in the source text. */
  base: number;
  before: string;
  after: string;
  /** Paragraph text including the following separator. Used to reuse gap strings. */
  signature: string;
}

/** Paragraph bounds for prose separated by blank lines, without allocating keys. */
export function simpleParagraphs(text: string): {
  leadingGap: string;
  paras: Array<{ keyStart: number; keyEnd: number; after: string }>;
} | null {
  if (
    text.includes("<") ||
    text.includes("{|") ||
    text.includes("|}") ||
    text.includes("|-\n")
  )
    return null;
  if (text.length > 0) {
    const code = text.charCodeAt(0);
    if (code === 32 || code === 9 || code === 10) return null;
  }
  const paras: Array<{ keyStart: number; keyEnd: number; after: string }> = [];
  let start = 0;
  while (start < text.length) {
    const nl = text.indexOf("\n\n", start);
    const end = nl < 0 ? text.length : nl;
    if (end === start) return null;
    const last = text.charCodeAt(end - 1);
    if (last === 32 || last === 9 || last === 10) return null;
    paras.push({ keyStart: start, keyEnd: end, after: nl < 0 ? "" : "\n\n" });
    if (nl < 0) break;
    start = nl + 2;
  }
  return { leadingGap: "", paras };
}

export function paragraphSpans(text: string): {
  leadingGap: string;
  spans: ParaSpan[];
} {
  const ranges = paragraphRanges(text);
  const spans: ParaSpan[] = [];
  let leadingGap = "";
  let carry = "";
  let cursor = 0;
  let have = false;

  const takeCarry = (extra: string) => {
    if (!extra) return;
    if (!have) leadingGap += extra;
    else spans[spans.length - 1]!.after += extra;
  };

  for (const range of ranges) {
    if (range.start > cursor) carry += text.slice(cursor, range.start);
    const raw = text.slice(range.start, range.end);
    const sep = text.slice(range.end, range.sepEnd);
    cursor = range.sepEnd;
    const left = leadingWsLen(raw);
    const right = trailingContentEnd(raw);
    if (left >= right) {
      carry += raw + sep;
      continue;
    }
    const key =
      left === 0 && right === raw.length ? raw : raw.slice(left, right);
    if (cachedParagraph(key).sentences.length === 0) {
      carry += raw + sep;
      continue;
    }
    const before = carry + raw.slice(0, left);
    carry = "";
    takeCarry(before);
    spans.push({
      key,
      base: range.start + left,
      before: "",
      after: raw.slice(right) + sep,
      signature: "",
    });
    have = true;
  }
  if (cursor < text.length) carry += text.slice(cursor);
  takeCarry(carry);
  for (const span of spans)
    span.signature = `${span.key.length}:${span.key}${span.after}`;
  return { leadingGap, spans };
}

export function materializeParagraph(span: ParaSpan): SplitParagraph {
  const cached = cachedParagraph(span.key);
  const sentences: SplitSentence[] = cached.sentences.map((sentence) => ({
    key: sentence.key,
    tokens: sentence.tokens.map((token) => ({
      value: token.value,
      start: span.base + token.relStart,
      end: span.base + token.relEnd,
      gapAfter: token.gapAfter,
    })),
  }));
  const lastSentence = sentences[sentences.length - 1];
  const lastToken = lastSentence?.tokens[lastSentence.tokens.length - 1];
  if (lastToken) lastToken.gapAfter += span.after;
  return { key: span.key, sentences };
}

export function splitDocument(text: string): SplitDoc {
  const described = paragraphSpans(text);
  return {
    leadingGap: described.leadingGap,
    paragraphs: described.spans.map((span) => materializeParagraph(span)),
  };
}

export function renderSplit(doc: SplitDoc): string {
  let out = doc.leadingGap;
  for (const para of doc.paragraphs) {
    for (const sent of para.sentences) {
      for (const tok of sent.tokens) out += tok.value + tok.gapAfter;
    }
  }
  return out;
}

export function flattenSplit(doc: SplitDoc): SplitToken[] {
  const out: SplitToken[] = [];
  for (const para of doc.paragraphs) {
    for (const sent of para.sentences) out.push(...sent.tokens);
  }
  return out;
}

function cachedParagraph(key: string): CachedParagraph {
  const hit = paragraphCache.get(key);
  if (hit) return hit;
  const built = splitTrimmedParagraph(key);
  paragraphCache.set(key, built);
  return built;
}

function splitTrimmedParagraph(text: string): CachedParagraph {
  const spans = sentenceSpans(text, 0, text.length);
  const sentences: CachedSentence[] = [];
  let carry = "";
  for (const [start, end] of spans) {
    const piece = text.slice(start, end);
    const tokenized = tokenizeRange(piece, start);
    if (tokenized.tokens.length === 0) {
      carry += piece;
      continue;
    }
    if (carry) {
      tokenized.tokens[0]!.gapBefore = carry + tokenized.tokens[0]!.gapBefore;
      carry = "";
    }
    if (tokenized.tokens[0]!.gapBefore) {
      if (sentences.length === 0) {
        // Leading whitespace inside a trimmed paragraph should not occur.
        tokenized.tokens[0]!.gapBefore = "";
      } else {
        const prev = sentences[sentences.length - 1]!;
        const last = prev.tokens[prev.tokens.length - 1]!;
        last.gapAfter += tokenized.tokens[0]!.gapBefore;
        tokenized.tokens[0]!.gapBefore = "";
      }
    }
    const tokens: CachedToken[] = tokenized.tokens.map((tok) => ({
      value: tok.value,
      relStart: tok.start,
      relEnd: tok.end,
      gapAfter: tok.gapAfter,
    }));
    sentences.push({ key: tokens.map((t) => t.value).join(" "), tokens });
  }
  return { sentences };
}

interface DraftToken {
  value: string;
  start: number;
  end: number;
  gapBefore: string;
  gapAfter: string;
}

function tokenizeRange(text: string, base: number): { tokens: DraftToken[] } {
  const tokens: DraftToken[] = [];
  let i = 0;
  const lead = i;
  while (i < text.length && isWsAt(text, i)) i += wsLen(text, i);
  const leading = text.slice(lead, i);

  while (i < text.length) {
    const multi = multiAt(text, i);
    let value: string;
    let end: number;
    if (multi) {
      value = multi;
      end = i + multi.length;
    } else {
      const cp = text.codePointAt(i)!;
      if (!isWordChar(cp)) {
        const len = cp > 0xffff ? 2 : 1;
        value = text.slice(i, i + len);
        end = i + len;
      } else {
        const start = i;
        while (i < text.length && !isWsAt(text, i) && !multiAt(text, i)) {
          const c = text.codePointAt(i)!;
          if (!isWordChar(c)) break;
          i += c > 0xffff ? 2 : 1;
        }
        value = text.slice(start, i);
        end = i;
        i = start;
      }
    }
    i = end;
    const gapStart = i;
    while (i < text.length && isWsAt(text, i)) i += wsLen(text, i);
    tokens.push({
      value,
      start: base + (end - value.length),
      end: base + end,
      gapBefore: tokens.length === 0 ? leading : "",
      gapAfter: text.slice(gapStart, i),
    });
  }
  return { tokens };
}

function sentenceSpans(
  text: string,
  start: number,
  end: number,
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = start;
  while (i < end) {
    const next = nextSentenceEnd(text, i, end);
    if (next <= i) {
      spans.push([i, end]);
      break;
    }
    spans.push([i, next]);
    i = next;
  }
  return spans;
}

function nextSentenceEnd(text: string, from: number, limit: number): number {
  const url = urlLengthAt(text, from, limit);
  if (url > 0) return from + url;

  for (let i = from; i < limit; i++) {
    const construct = constructEnd(text, i, limit);
    if (construct > i) {
      if (construct >= limit) return limit;
      if (text.slice(i, construct).includes("\n")) {
        let end = construct;
        if (text.charCodeAt(end) === 10) end++;
        return Math.min(limit, end);
      }
      i = construct - 1;
      continue;
    }
    if (i > from && urlLengthAt(text, i, limit) > 0) return i;
    const code = text.charCodeAt(i);
    if (code === 10 || code === 9) return i + 1;
    if (i + 1 < limit && text.charCodeAt(i + 1) === 32) {
      const c = text[i]!;
      if (c === ";" || c === "?" || c === ":") return i + 2;
      if (c === "!" && i > from && isWordChar(text.codePointAt(i - 1)!))
        return i + 2;
    }
    if (
      i >= from + 3 &&
      text[i] === "." &&
      i + 1 < limit &&
      text.charCodeAt(i + 1) === 32 &&
      isSentenceDotPrefix(text, i)
    ) {
      return i + 2;
    }
    if (i > from && text.startsWith("<!--", i)) return i;
    if (text.startsWith("-->", i) && i + 3 <= limit) return i + 3;
    if (i > from && startsWithCi(text, "<ref", i)) return i;
    if (startsWithCi(text, "/ref>", i) && i + 5 <= limit) return i + 5;
  }
  return limit;
}

function isSentenceDotPrefix(text: string, dot: number): boolean {
  for (let k = dot - 3; k < dot; k++) {
    const ch = text[k]!;
    if (/\s/u.test(ch) || ch === "." || ch === "=") return false;
  }
  return true;
}

function urlLengthAt(text: string, i: number, limit: number): number {
  if (!text.startsWith("http", i)) return 0;
  const window = text.slice(i, Math.min(limit, i + 48));
  const scheme = window.indexOf("://");
  if (scheme < 0) return 0;
  if (/\s/u.test(window.slice(0, scheme))) return 0;
  let j = i + scheme + 3;
  while (j < limit) {
    const c = text[j]!;
    if (
      c === " " ||
      c === "|" ||
      c === "<" ||
      c === ">" ||
      c === "\n" ||
      c === "\t"
    )
      break;
    j++;
  }
  return j - i;
}

interface ParaRange {
  start: number;
  end: number;
  sepEnd: number;
}

function paragraphRanges(text: string): ParaRange[] {
  const ranges: ParaRange[] = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  while (i < n) {
    const code = text.charCodeAt(i);
    const construct = constructEnd(text, i, n);
    if (construct > i) {
      i = construct;
      continue;
    }
    if (code === 10 && i + 1 < n && text.charCodeAt(i + 1) === 10) {
      let j = i + 2;
      while (j < n && text.charCodeAt(j) === 10) j++;
      if (i > start) ranges.push({ start, end: i, sepEnd: j });
      i = j;
      start = i;
      continue;
    }
    if (code === 123 || code === 124 || code === 60) {
      if (i > start && opensParagraph(text, i)) {
        ranges.push({ start, end: i, sepEnd: i });
        start = i;
      }
      const closed = closerEnd(text, i);
      if (closed > i && closed > start && closed < n) {
        ranges.push({ start, end: closed, sepEnd: closed });
        start = closed;
        i = closed;
        continue;
      }
    }
    i++;
  }
  if (start < n) ranges.push({ start, end: n, sepEnd: n });
  return ranges;
}

/** End index of a template, link, ref, comment, nowiki, or external link at `i`. */
function constructEnd(text: string, i: number, limit: number): number {
  if (text.startsWith("{{", i))
    return matchDelim(text, i + 2, limit, "{{", "}}");
  if (text.startsWith("[[", i))
    return matchDelim(text, i + 2, limit, "[[", "]]");
  if (text.startsWith("<!--", i)) {
    const end = text.indexOf("-->", i + 4);
    if (end < 0 || end >= limit) return limit;
    return end + 3;
  }
  if (tagAt(text, i, "<nowiki")) {
    const end = indexOfCi(text, "</nowiki>", i + 7, limit);
    return end < 0 ? limit : end + "</nowiki>".length;
  }
  if (tagAt(text, i, "<ref")) {
    const gt = text.indexOf(">", i);
    if (gt < 0 || gt >= limit) return limit;
    if (text.charCodeAt(gt - 1) === 47) return gt + 1;
    const end = indexOfCi(text, "</ref>", gt + 1, limit);
    return end < 0 ? limit : end + "</ref>".length;
  }
  if (text.charCodeAt(i) === 91 && text.charCodeAt(i + 1) !== 91) {
    return externalLinkEnd(text, i, limit);
  }
  return -1;
}

function matchDelim(
  text: string,
  from: number,
  limit: number,
  open: string,
  close: string,
): number {
  let depth = 1;
  const end = Math.min(text.length, limit);
  for (let i = from; i < end; i++) {
    if (text.startsWith(open, i)) {
      depth++;
      i += open.length - 1;
      continue;
    }
    if (text.startsWith(close, i)) {
      depth--;
      i += close.length - 1;
      if (depth === 0) return i + 1;
    }
  }
  return limit;
}

function externalLinkEnd(text: string, i: number, limit: number): number {
  const window = text.slice(i + 1, Math.min(limit, i + 16));
  if (!/^(?:https?:|ftps?:|mailto:|news:|irc:|\/\/)/i.test(window)) return -1;
  const end = Math.min(text.length, limit);
  for (let j = i + 1; j < end; j++) {
    const code = text.charCodeAt(j);
    if (code === 93) return j + 1;
    if (code === 10) return -1;
  }
  return -1;
}

function indexOfCi(
  text: string,
  needle: string,
  from: number,
  limit: number,
): number {
  const last = Math.min(text.length, limit) - needle.length;
  for (let i = from; i <= last; i++) {
    if (startsWithCi(text, needle, i)) return i;
  }
  return -1;
}

function closerEnd(text: string, i: number): number {
  if (text.startsWith("|}", i)) return i + 2;
  if (startsWithCi(text, "</table>", i)) return i + "</table>".length;
  if (startsWithCi(text, "</tr>", i)) return i + "</tr>".length;
  return -1;
}

function opensParagraph(text: string, i: number): boolean {
  if (text.startsWith("{|", i)) return true;
  if (text.startsWith("|-\n", i)) return true;
  if (tagAt(text, i, "<table")) return true;
  if (tagAt(text, i, "<tr")) return true;
  return false;
}

function tagAt(text: string, i: number, tag: string): boolean {
  if (!startsWithCi(text, tag, i)) return false;
  const next = text.charCodeAt(i + tag.length);
  return (
    next === undefined ||
    next === 62 ||
    next === 47 ||
    next === 32 ||
    next === 9 ||
    next === 10
  );
}

function startsWithCi(text: string, needle: string, i: number): boolean {
  if (i + needle.length > text.length) return false;
  for (let k = 0; k < needle.length; k++) {
    const a = text.charCodeAt(i + k);
    const b = needle.charCodeAt(k);
    if (a === b) continue;
    if (a >= 65 && a <= 90 && a + 32 === b) continue;
    if (b >= 65 && b <= 90 && b + 32 === a) continue;
    return false;
  }
  return true;
}

function multiAt(text: string, i: number): string | null {
  for (const m of MULTI) {
    if (text.startsWith(m, i)) return m;
  }
  return null;
}

function isWsAt(text: string, i: number): boolean {
  const cp = text.codePointAt(i);
  if (cp === undefined) return false;
  if (cp === 0xfeff) return true;
  if (cp === 32 || cp === 9 || cp === 10 || cp === 13 || cp === 12 || cp === 11)
    return true;
  if (cp < 128) return false;
  return /\s/u.test(String.fromCodePoint(cp));
}

function wsLen(text: string, i: number): number {
  const cp = text.codePointAt(i)!;
  return cp > 0xffff ? 2 : 1;
}

function isWordChar(cp: number): boolean {
  if (cp >= 48 && cp <= 57) return true;
  if ((cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122)) return true;
  if (cp < 128) return false;
  return /\p{L}|\p{Nd}/u.test(String.fromCodePoint(cp));
}

function leadingWsLen(text: string): number {
  let i = 0;
  while (i < text.length && isWsAt(text, i)) i += wsLen(text, i);
  return i;
}

function trailingContentEnd(text: string): number {
  let i = text.length;
  while (i > 0) {
    const prev = i - (text.codePointAt(i - 1)! > 0xffff ? 2 : 1);
    const cp = text.codePointAt(prev)!;
    if (!isWsCode(cp)) break;
    i = prev;
  }
  return i;
}

function isWsCode(cp: number): boolean {
  if (cp === 0xfeff) return true;
  if (cp === 32 || cp === 9 || cp === 10 || cp === 13 || cp === 12 || cp === 11)
    return true;
  if (cp < 128) return false;
  return /\s/u.test(String.fromCodePoint(cp));
}
