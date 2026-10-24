export interface ScanToken {
  id: number;
  text: string;
  gapAfter: string;
}

export interface ConstructPair {
  openerId: number;
  closerId: number;
  kind: "template" | "link" | "extlink" | "table" | "comment" | "ref" | "tag";
  tag?: string;
}

export interface UnclosedConstruct {
  openerId: number;
  kind: "template" | "link" | "comment" | "ref" | "nowiki";
}

export interface RefHit {
  kind: "def" | "use";
  name: string | null;
  openerId: number;
  /** Last token of the construct. */
  endId: number;
  tokenIds: number[];
  /** Origins are filled by the caller; the scanner only knows token ids. */
  contentTokenIds: number[];
  listDefined: boolean;
}

export interface ScanResult {
  pairs: ConstructPair[];
  refs: RefHit[];
  /** Opened constructs that never closed, from the opener through the last token. */
  unclosed: UnclosedConstruct[];
}

const COMMON_TAGS = new Set([
  "nowiki",
  "pre",
  "syntaxhighlight",
  "math",
  "table",
  "tr",
  "td",
  "th",
  "div",
  "span",
  "gallery",
  "poem",
  "blockquote",
  "code",
  "source",
  "references",
  "ref",
]);

interface Frame {
  kind: "template" | "link" | "table" | "comment" | "tag" | "nowiki" | "ref";
  openerId: number;
  tag: string;
  start: number;
  refName: string | null;
  contentStart: number;
}

export function scanTokens(tokens: readonly ScanToken[]): ScanResult {
  const pairs: ConstructPair[] = [];
  const refs: RefHit[] = [];
  const stack: Frame[] = [];

  const insideList = () =>
    stack.some(
      (frame) =>
        (frame.kind === "template" && frame.tag === "reflist") ||
        (frame.kind === "tag" && frame.tag === "references"),
    );

  const pushPair = (frame: Frame, closerId: number) => {
    const kind =
      frame.kind === "nowiki" || frame.kind === "tag"
        ? "tag"
        : frame.kind === "ref"
          ? "ref"
          : frame.kind;
    pairs.push({
      openerId: frame.openerId,
      closerId,
      kind,
      tag: frame.tag || undefined,
    });
  };

  const closeKind = (
    kind: Frame["kind"],
    closerId: number,
    inclusiveEnd: number,
    contentEnd?: number,
  ) => {
    const frame = stack[stack.length - 1];
    if (!frame || frame.kind !== kind) return;
    if (kind === "ref") {
      const slice = tokens.slice(frame.start, inclusiveEnd + 1);
      refs.push({
        kind: "def",
        name: frame.refName,
        openerId: frame.openerId,
        endId: closerId,
        tokenIds: slice.map((t) => t.id),
        contentTokenIds: tokens
          .slice(frame.contentStart, contentEnd ?? inclusiveEnd)
          .map((t) => t.id),
        listDefined: insideList(),
      });
    }
    pushPair(frame, closerId);
    stack.pop();
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const top = stack[stack.length - 1];

    if (top?.kind === "comment") {
      if (tok.text === "-->") {
        pushPair(top, tok.id);
        stack.pop();
      }
      continue;
    }
    if (top?.kind === "nowiki") {
      const closed = closingTag(tokens, i, "nowiki");
      if (closed) {
        pushPair(top, tokens[closed.end]!.id);
        stack.pop();
        i = closed.end;
      }
      continue;
    }

    if (tok.text === "<!--") {
      stack.push({
        kind: "comment",
        openerId: tok.id,
        tag: "",
        start: i,
        refName: null,
        contentStart: i,
      });
      continue;
    }
    if (tok.text === "{{") {
      const name = (tokens[i + 1]?.text ?? "").toLowerCase();
      stack.push({
        kind: "template",
        openerId: tok.id,
        tag: name,
        start: i,
        refName: null,
        contentStart: i,
      });
      continue;
    }
    if (tok.text === "}}") {
      closeKind("template", tok.id, i);
      continue;
    }
    if (tok.text === "[[") {
      stack.push({
        kind: "link",
        openerId: tok.id,
        tag: "",
        start: i,
        refName: null,
        contentStart: i,
      });
      continue;
    }
    if (tok.text === "]]") {
      closeKind("link", tok.id, i);
      continue;
    }
    if (tok.text === "{" && tokens[i + 1]?.text === "|") {
      stack.push({
        kind: "table",
        openerId: tok.id,
        tag: "",
        start: i,
        refName: null,
        contentStart: i,
      });
      i++;
      continue;
    }
    if (tok.text === "|" && tokens[i + 1]?.text === "}") {
      closeKind("table", tokens[i + 1]!.id, i + 1);
      i++;
      continue;
    }
    if (tok.text === "[") {
      const end = externalLinkEnd(tokens, i);
      if (end > i) {
        pairs.push({
          openerId: tok.id,
          closerId: tokens[end]!.id,
          kind: "extlink",
        });
      }
      continue;
    }

    if (tok.text !== "<") continue;
    const closed = closingTag(tokens, i, null);
    if (closed) {
      const name = closed.name.toLowerCase();
      if (name === "ref")
        closeKind("ref", tokens[closed.end]!.id, closed.end, i);
      else if (COMMON_TAGS.has(name))
        closeKind("tag", tokens[closed.end]!.id, closed.end);
      i = closed.end;
      continue;
    }

    const opened = openingTag(tokens, i);
    if (!opened) continue;
    const name = opened.name.toLowerCase();
    if (opened.selfClosing) {
      if (name === "ref") {
        const slice = tokens.slice(i, opened.end + 1);
        refs.push({
          kind: "use",
          name: opened.refName,
          openerId: tok.id,
          endId: tokens[opened.end]!.id,
          tokenIds: slice.map((t) => t.id),
          contentTokenIds: [],
          listDefined: insideList(),
        });
        pairs.push({
          openerId: tok.id,
          closerId: tokens[opened.end]!.id,
          kind: "ref",
          tag: "ref",
        });
      }
      i = opened.end;
      continue;
    }
    if (name === "nowiki") {
      stack.push({
        kind: "nowiki",
        openerId: tok.id,
        tag: "nowiki",
        start: i,
        refName: null,
        contentStart: opened.end + 1,
      });
    } else if (name === "ref") {
      stack.push({
        kind: "ref",
        openerId: tok.id,
        tag: "ref",
        start: i,
        refName: opened.refName,
        contentStart: opened.end + 1,
      });
    } else if (COMMON_TAGS.has(name)) {
      stack.push({
        kind: "tag",
        openerId: tok.id,
        tag: name,
        start: i,
        refName: null,
        contentStart: opened.end + 1,
      });
    }
    i = opened.end;
  }

  const unclosed: UnclosedConstruct[] = [];
  for (const frame of stack) {
    if (
      frame.kind === "template" ||
      frame.kind === "link" ||
      frame.kind === "comment" ||
      frame.kind === "ref"
    ) {
      unclosed.push({ openerId: frame.openerId, kind: frame.kind });
    } else if (frame.kind === "nowiki") {
      unclosed.push({ openerId: frame.openerId, kind: "nowiki" });
    }
  }

  return { pairs, refs, unclosed };
}

const ATOMIC_KINDS = new Set<ConstructPair["kind"]>([
  "template",
  "link",
  "extlink",
  "comment",
  "ref",
]);

export interface AtomicSpan {
  start: number;
  end: number;
}

/** Outermost template, link, ref, comment, nowiki, and external-link spans. */
export function outermostAtomic(tokens: readonly ScanToken[]): AtomicSpan[] {
  const idToIndex = new Map<number, number>();
  tokens.forEach((token, index) => idToIndex.set(token.id, index));
  const scan = scanTokens(tokens);
  const spans: AtomicSpan[] = [];
  const push = (openerId: number, closerId: number | null, kind: string) => {
    const start = idToIndex.get(openerId);
    if (start === undefined) return;
    const end =
      closerId === null ? tokens.length : (idToIndex.get(closerId) ?? -1) + 1;
    if (end <= start) return;
    if (
      kind === "template" &&
      hidesTemplateInterior(tokens, scan, idToIndex, start, end)
    ) {
      return;
    }
    spans.push({ start, end });
  };
  for (const pair of scan.pairs) {
    if (pair.kind === "tag") {
      if (pair.tag !== "nowiki") continue;
      push(pair.openerId, pair.closerId, "nowiki");
    } else if (ATOMIC_KINDS.has(pair.kind)) {
      push(pair.openerId, pair.closerId, pair.kind);
    }
  }
  for (const open of scan.unclosed) push(open.openerId, null, open.kind);
  return keepOutermost(spans);
}

/** A multiline template that contains a ref is aligned on its interior. */
function hidesTemplateInterior(
  tokens: readonly ScanToken[],
  scan: ScanResult,
  idToIndex: ReadonlyMap<number, number>,
  start: number,
  end: number,
): boolean {
  const last = Math.min(end, tokens.length);
  let newline = false;
  for (let i = start; i < last; i++) {
    const token = tokens[i]!;
    if (token.text.includes("\n")) {
      newline = true;
      break;
    }
    if (i + 1 < last && token.gapAfter.includes("\n")) {
      newline = true;
      break;
    }
  }
  if (!newline) return false;
  for (const ref of scan.refs) {
    const opener = idToIndex.get(ref.openerId);
    if (opener !== undefined && opener > start && opener < end) return true;
  }
  for (const open of scan.unclosed) {
    if (open.kind !== "ref") continue;
    const opener = idToIndex.get(open.openerId);
    if (opener !== undefined && opener > start && opener < end) return true;
  }
  return false;
}

function keepOutermost(spans: readonly AtomicSpan[]): AtomicSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: AtomicSpan[] = [];
  let covered = -1;
  for (const span of sorted) {
    if (span.end <= span.start || span.start < covered) continue;
    out.push(span);
    covered = span.end;
  }
  return out;
}

function externalLinkEnd(tokens: readonly ScanToken[], open: number): number {
  const head = tokens[open + 1]?.text ?? "";
  const scheme = /^(?:https?|ftps?|mailto|news|irc)$/i.test(head);
  const protocolRelative = head === "/" && tokens[open + 2]?.text === "/";
  if (!scheme && !protocolRelative) return -1;
  const limit = Math.min(tokens.length, open + 80);
  for (let j = open + 1; j < limit; j++) {
    if (tokens[j]!.text === "]") return j;
    if (tokens[j]!.text === "[" || tokens[j]!.text === "[[") return -1;
    if (tokens[j]!.gapAfter.includes("\n")) return -1;
  }
  return -1;
}

export function normalizeRefName(name: string): string {
  let s = name.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.trim();
}

interface TagClose {
  name: string;
  end: number;
}

function closingTag(
  tokens: readonly ScanToken[],
  i: number,
  expected: string | null,
): TagClose | null {
  if (tokens[i]?.text !== "<" || tokens[i + 1]?.text !== "/") return null;
  const name = tokens[i + 2]?.text ?? "";
  if (!name || (expected !== null && name.toLowerCase() !== expected))
    return null;
  const end = findGt(tokens, i + 3);
  if (end < 0) return null;
  return { name, end };
}

interface TagOpen {
  name: string;
  end: number;
  selfClosing: boolean;
  refName: string | null;
}

function openingTag(tokens: readonly ScanToken[], i: number): TagOpen | null {
  const name = tokens[i + 1]?.text ?? "";
  if (!name || name === "/" || name === ">") return null;
  const end = findGt(tokens, i + 2);
  if (end < 0) return null;
  const selfClosing = tokens[end - 1]?.text === "/";
  let refName: string | null = null;
  if (name.toLowerCase() === "ref") refName = readRefName(tokens, i + 2, end);
  return { name, end, selfClosing, refName };
}

function findGt(tokens: readonly ScanToken[], from: number): number {
  const limit = Math.min(tokens.length, from + 80);
  for (let i = from; i < limit; i++) {
    if (tokens[i]!.text === ">") return i;
  }
  return -1;
}

function readRefName(
  tokens: readonly ScanToken[],
  from: number,
  gt: number,
): string | null {
  for (let i = from; i < gt; i++) {
    if (tokens[i]!.text.toLowerCase() !== "name") continue;
    let j = i + 1;
    if (tokens[j]?.text === "=") j++;
    else continue;
    if (j >= gt) return null;
    const quote = tokens[j]!.text;
    if (quote === '"' || quote === "'") {
      let s = "";
      j++;
      while (j < gt && tokens[j]!.text !== quote) {
        s += tokens[j]!.text;
        if (j + 1 < gt && tokens[j + 1]!.text !== quote)
          s += tokens[j]!.gapAfter;
        j++;
      }
      return normalizeRefName(s);
    }
    return normalizeRefName(tokens[j]!.text);
  }
  return null;
}
