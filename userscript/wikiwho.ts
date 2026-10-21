const WIKIWHO =
  "https://wikiwho.wmcloud.org/en/api/v1.0.0-beta/latest_rev_content/page_id";

export async function authorshipPercent(
  pageid: number,
  editors: ReadonlySet<string>,
): Promise<number> {
  const payload = await withRetry(() => fetchTokens(pageid));
  const tokens = tokenRecords(payload);
  if (tokens.length === 0) {
    throw new Error("WikiWho returned no tokens");
  }
  return articleAuthorshipPercent(tokens, editors);
}

async function fetchTokens(pageid: number): Promise<unknown> {
  const url = `${WIKIWHO}/${pageid}/?${new URLSearchParams({
    editor: "true",
    o_rev_id: "false",
    token_id: "false",
    out: "false",
    in: "false",
  })}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WikiWho HTTP ${response.status}`);
  }
  return response.json();
}

export function tokenEditors(payload: unknown): string[] {
  return tokenRecords(payload).map((token) => token.editor);
}

export function articleAuthorshipPercent(
  tokens: readonly WhoToken[],
  editors: ReadonlySet<string>,
): number {
  const article = proseTokens(tokens);
  if (article.length === 0) return 0;
  const matched = article.filter((token) => editors.has(token.editor)).length;
  return (matched / article.length) * 100;
}

interface WhoToken {
  str: string;
  editor: string;
}

function tokenRecords(payload: unknown): WhoToken[] {
  const tokens: WhoToken[] = [];
  walk(payload, tokens);
  return tokens;
}

function walk(node: unknown, tokens: WhoToken[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, tokens);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.str === "string" && typeof record.editor === "string") {
    tokens.push({ str: record.str, editor: record.editor });
    return;
  }
  for (const value of Object.values(record)) walk(value, tokens);
}

/** Tables, categories, and file links are not article prose. */
export function proseTokens(tokens: readonly WhoToken[]): WhoToken[] {
  const out: WhoToken[] = [];
  let table = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (table === 0 && opensTable(token.str, tokens[i + 1]?.str)) {
      table += 1;
      if (token.str === "{" && tokens[i + 1]?.str === "|") i += 1;
      continue;
    }
    if (table > 0) {
      if (closesTable(token.str, tokens[i + 1]?.str)) {
        table -= 1;
        if (token.str === "|" && tokens[i + 1]?.str === "}") i += 1;
      }
      continue;
    }
    const linkEnd = nonArticleLinkEnd(tokens, i);
    if (linkEnd != null) {
      i = linkEnd;
      continue;
    }
    out.push(token);
  }
  return out;
}

function opensTable(str: string, next: string | undefined): boolean {
  const text = str.trim();
  if (text === "{|" || text.startsWith("{|")) return true;
  if (/^<table(\s|>|\/)/i.test(text)) return true;
  return text === "{" && next === "|";
}

function closesTable(str: string, next: string | undefined): boolean {
  const text = str.trim();
  if (text === "|}" || text.endsWith("|}")) return true;
  if (/^<\/table\b/i.test(text)) return true;
  return text === "|" && next === "}";
}

function nonArticleLinkEnd(
  tokens: readonly WhoToken[],
  index: number,
): number | null {
  const first = tokens[index]?.str ?? "";
  if (first !== "[[" && !first.startsWith("[[")) return null;
  let acc = "";
  for (let j = index; j < tokens.length && j < index + 8; j++) {
    acc += tokens[j]!.str;
    if (!acc.includes("]]") && tokens[j]!.str !== "]]") continue;
    if (/\[\[\s*(?:category|file|image)\s*:/i.test(acc)) return j;
    return null;
  }
  return null;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return fn();
  }
}
