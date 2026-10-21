/** Drop wiki-table rows that are no longer inside a table. */
export function stripNakedTables(content: string): {
  content: string;
  lineMap: Array<number | null>;
  removed: boolean;
} {
  const lines = content.split("\n");
  const lineMap: Array<number | null> = [];
  const kept: string[] = [];
  let tableDepth = 0;
  let templateDepth = 0;
  let removed = false;
  for (const line of lines) {
    const opens = countOpens(line);
    const insideTable = tableDepth > 0 || opens > 0;
    const naked = !insideTable && templateDepth === 0 && isTableRow(line);
    tableDepth = Math.max(0, tableDepth + opens - countCloses(line));
    templateDepth = Math.max(0, templateDepth + templateDelta(line));
    if (naked) {
      removed = true;
      lineMap.push(null);
      continue;
    }
    lineMap.push(kept.length);
    kept.push(line);
  }
  const collapsed = removed
    ? collapseBlankLines(kept, lineMap)
    : { content, lineMap: lines.map((_, index) => index) };
  return {
    content: collapsed.content,
    lineMap: collapsed.lineMap,
    removed,
  };
}

export function mapStrippedLine(
  line: number,
  lineMap: readonly (number | null)[],
): number | null {
  if (lineMap.length === 0) return null;
  if (line < 0) return lineMap[0] ?? null;
  if (line >= lineMap.length) return lineMap[lineMap.length - 1] ?? null;
  if (lineMap[line] != null) return lineMap[line]!;
  for (let i = line + 1; i < lineMap.length; i++) {
    if (lineMap[i] != null) return lineMap[i]!;
  }
  for (let i = line - 1; i >= 0; i--) {
    if (lineMap[i] != null) return lineMap[i]!;
  }
  return null;
}

const TABLE_ATTR =
  /^(rowspan|colspan|style|class|align|valign|width|height|scope|bgcolor|id|lang|dir|title)$/i;

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith("|-")) return true;
  if (trimmed.startsWith("|}") || trimmed.startsWith("{|")) return false;
  if (!(trimmed.startsWith("|") || trimmed.startsWith("!"))) return false;
  return !isTemplateParam(trimmed);
}

/** `| name = value` is a template parameter, including when it contains links. */
function isTemplateParam(trimmed: string): boolean {
  if (
    !trimmed.startsWith("|") ||
    trimmed.startsWith("|-") ||
    trimmed.startsWith("|}") ||
    trimmed.includes("||")
  ) {
    return false;
  }
  const match = /^\|\s*([^|=]+?)\s*=/.exec(trimmed);
  if (!match) return false;
  const name = match[1]!.trim();
  if (name === "" || TABLE_ATTR.test(name) || /["'|]/.test(name)) return false;
  return /^[\w #./:+-]+$/.test(name);
}

function templateDelta(line: string): number {
  let delta = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const pair = line[i]! + line[i + 1]!;
    if (pair === "{{") {
      delta += 1;
      i += 1;
    } else if (pair === "}}") {
      delta -= 1;
      i += 1;
    }
  }
  return delta;
}

function countOpens(line: string): number {
  return count(line, "{|") + countTag(line, /<table\b/gi);
}

function countCloses(line: string): number {
  return count(line, "|}") + countTag(line, /<\/table\b/gi);
}

function count(line: string, needle: string): number {
  let found = 0;
  let from = 0;
  while (from < line.length) {
    const at = line.indexOf(needle, from);
    if (at < 0) break;
    found += 1;
    from = at + needle.length;
  }
  return found;
}

function countTag(line: string, pattern: RegExp): number {
  return line.match(pattern)?.length ?? 0;
}

function collapseBlankLines(
  lines: readonly string[],
  lineMap: Array<number | null>,
): { content: string; lineMap: Array<number | null> } {
  const kept: string[] = [];
  const remap = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    const blank = lines[i]!.trim() === "";
    if (blank && (kept.length === 0 || kept[kept.length - 1]!.trim() === "")) {
      continue;
    }
    remap.set(i, kept.length);
    kept.push(lines[i]!);
  }
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === "") {
    kept.pop();
  }
  return {
    content: kept.join("\n"),
    lineMap: lineMap.map((line) =>
      line == null ? null : (remap.get(line) ?? null),
    ),
  };
}
