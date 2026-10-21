import { describe, expect, it } from "vitest";
import { cleanTaintedHistory, type Revision } from "../scrubber/index";
import { normalizeNewlines } from "../scrubber/split";

const enabled = process.env.EMF_CORPUS === "1";
const USER = "Carigval.97";
const START = "2026-08-31T23:59:59Z";
const END = "2026-07-01T00:00:00Z";
const AGENT = "evenmorefire-scrubber/0.0 (local markup corpus)";

interface Contrib {
  revid: number;
  parentid: number;
  title: string;
  sizediff: number;
  timestamp: string;
}

interface SlotRevision {
  revid: number;
  parentid?: number;
  user?: string;
  timestamp?: string;
  size?: number;
  content: string | null;
}

describe.skipIf(!enabled)("Carigval.97 corpus", () => {
  it(
    "reverts mainspace edits of +100 bytes to the parent",
    async () => {
      const contribs = (await listContribs()).filter(
        (row) => row.sizediff >= 100,
      );
      expect(contribs.length).toBeGreaterThan(100);
      const ids = new Set<number>();
      for (const row of contribs) {
        ids.add(row.revid);
        if (row.parentid > 0) ids.add(row.parentid);
      }
      const text = await fetchSlots([...ids]);
      const hidden: string[] = [];
      const failures: string[] = [];
      for (const row of contribs) {
        const child = text.get(row.revid);
        if (!child) {
          hidden.push(`${row.title} ${row.revid} (edit hidden)`);
          continue;
        }
        const parent = row.parentid > 0 ? text.get(row.parentid) : "";
        if (parent === undefined) {
          hidden.push(
            `${row.title} ${row.revid} (parent ${row.parentid} hidden)`,
          );
          continue;
        }
        let scrubbed = "";
        try {
          scrubbed = normalizeNewlines(
            cleanTaintedHistory(
              [
                ...(parent === ""
                  ? []
                  : [{ revid: row.parentid, content: parent }]),
                { revid: row.revid, content: child },
              ],
              [row.revid],
            ).content,
          );
        } catch (error) {
          failures.push(
            `${row.title} ${row.revid} threw ${error instanceof Error ? error.message.split("\n")[0] : error}`,
          );
          continue;
        }
        const expected = normalizeNewlines(parent);
        if (scrubbed === expected) continue;
        failures.push(diffLine(row, expected, scrubbed));
      }
      if (hidden.length > 0) {
        console.log(`hidden revisions: ${hidden.length}`);
        for (const line of hidden.slice(0, 20)) console.log(line);
      }
      expect(failures, failures.slice(0, 12).join("\n")).toEqual([]);
    },
    30 * 60 * 1000,
  );

  it(
    "scrubs the full Coquimbo Unido history without tearing the lead",
    async () => {
      const history = await fetchHistory("Coquimbo Unido");
      const tainted: number[] = [];
      for (let i = 0; i < history.length; i++) {
        const revision = history[i]!;
        if (revision.user !== USER || !revision.timestamp) continue;
        if (revision.timestamp < END || revision.timestamp > START) continue;
        const previous = history[i - 1];
        const delta =
          revision.size != null && previous?.size != null
            ? revision.size - previous.size
            : revision.content == null
              ? 0
              : revision.content.length - (previous?.content?.length ?? 0);
        if (delta >= 100 && revision.content != null)
          tainted.push(revision.revid);
      }
      expect(tainted.length).toBeGreaterThan(0);
      const first = tainted[0]!;
      const at = history.findIndex((revision) => revision.revid === first);
      const pre = history[at - 1];
      expect(pre?.content).toBeTruthy();
      const visible: Revision[] = history.map((revision) => ({
        revid: revision.revid,
        timestamp: revision.timestamp,
        content: revision.content,
      }));
      const scrubbed = normalizeNewlines(
        cleanTaintedHistory(visible, tainted).content,
      );
      expect(balanced(scrubbed)).toBe(true);
      const lead = sectionLead(scrubbed);
      const current = [...history]
        .reverse()
        .find((revision) => revision.content);
      const currentLead = sectionLead(current!.content!);
      expect(lead).not.toMatch(/\[\[ \]\]/);
      expect(lead).not.toMatch(/\| \]\]/);
      expect(lead).not.toContain("Chilean[[");
      const keptOldSentence = lead.includes(
        "is a Chilean [[football (soccer)|football]]",
      );
      const keptCurrent = lead === currentLead;
      expect(
        keptOldSentence || keptCurrent,
        "lead keeps the pre-edit sentence or the latest lead",
      ).toBe(true);
      const preBox = infobox(pre!.content!);
      const scrubBox = infobox(scrubbed);
      const currentBox = infobox(current!.content!);
      const boxOk =
        scrubBox === preBox ||
        scrubBox === currentBox ||
        scrubBox.replaceAll("<br/>", "<br />") === preBox ||
        scrubBox.replaceAll("<br />", "<br/>") === currentBox;
      if (!boxOk) {
        console.log("--- pre box ---");
        console.log(preBox.slice(0, 400));
        console.log("--- scrub box ---");
        console.log(scrubBox.slice(0, 400));
      }
      expect(boxOk).toBe(true);
    },
    30 * 60 * 1000,
  );
});

function sectionLead(text: string): string {
  const norm = normalizeNewlines(text);
  const at = norm.search(/\n==[^=]/);
  return at < 0 ? norm : norm.slice(0, at);
}

function infobox(text: string): string {
  const norm = normalizeNewlines(text);
  const start = norm.indexOf("{{Infobox");
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < norm.length - 1; i++) {
    const pair = norm.slice(i, i + 2);
    if (pair === "{{") {
      depth++;
      i++;
    } else if (pair === "}}") {
      depth--;
      i++;
      if (depth === 0) return norm.slice(start, i + 1);
    }
  }
  return norm.slice(start);
}

function balanced(text: string): boolean {
  const counts = (open: string, close: string) => {
    let n = 0;
    let i = 0;
    while (i < text.length) {
      if (text.startsWith(open, i)) {
        n++;
        i += open.length;
      } else if (text.startsWith(close, i)) {
        n--;
        i += close.length;
        if (n < 0) return false;
      } else i++;
    }
    return n === 0;
  };
  return counts("{{", "}}") && counts("[[", "]]");
}

function diffLine(row: Contrib, expected: string, got: string): string {
  let i = 0;
  const limit = Math.min(expected.length, got.length);
  while (i < limit && expected[i] === got[i]) i++;
  return [
    `${row.title} ${row.revid} +${row.sizediff}`,
    `at ${i}`,
    `parent ${JSON.stringify(expected.slice(i, i + 80))}`,
    `scrub  ${JSON.stringify(got.slice(i, i + 80))}`,
  ].join(" ");
}

async function listContribs(): Promise<Contrib[]> {
  const rows: Contrib[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      action: "query",
      list: "usercontribs",
      ucuser: USER,
      ucnamespace: "0",
      ucstart: START,
      ucend: END,
      ucdir: "older",
      uclimit: "500",
      ucprop: "ids|title|sizediff|timestamp",
      format: "json",
      formatversion: "2",
    });
    if (cursor) params.set("uccontinue", cursor);
    const data = await wiki(params);
    const batch = (data.query?.usercontribs ?? []) as Record<string, unknown>[];
    for (const row of batch) {
      if (typeof row.revid !== "number" || typeof row.title !== "string")
        continue;
      rows.push({
        revid: row.revid,
        parentid: typeof row.parentid === "number" ? row.parentid : 0,
        title: row.title,
        sizediff: typeof row.sizediff === "number" ? row.sizediff : 0,
        timestamp: typeof row.timestamp === "string" ? row.timestamp : "",
      });
    }
    cursor = data.continue?.uccontinue as string | undefined;
  } while (cursor);
  return rows;
}

async function fetchSlots(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 40) {
    const slice = ids.slice(i, i + 40);
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      revids: slice.join("|"),
      rvprop: "ids|content",
      rvslots: "main",
      format: "json",
      formatversion: "2",
    });
    const data = await wiki(params);
    for (const page of data.query?.pages ?? []) {
      for (const revision of page.revisions ?? []) {
        const content = revision.slots?.main?.content;
        if (typeof revision.revid === "number" && typeof content === "string") {
          out.set(revision.revid, content);
        }
      }
    }
  }
  return out;
}

async function fetchHistory(title: string): Promise<SlotRevision[]> {
  const revisions: SlotRevision[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: title,
      rvprop: "ids|timestamp|user|size|content",
      rvslots: "main",
      rvlimit: "50",
      format: "json",
      formatversion: "2",
    });
    if (cursor) params.set("rvcontinue", cursor);
    const data = await wiki(params);
    const page = data.query?.pages?.[0];
    for (const revision of page?.revisions ?? []) {
      const content = revision.slots?.main?.content;
      if (typeof revision.revid !== "number") continue;
      revisions.push({
        revid: revision.revid,
        parentid:
          typeof revision.parentid === "number" ? revision.parentid : undefined,
        user: typeof revision.user === "string" ? revision.user : undefined,
        timestamp:
          typeof revision.timestamp === "string"
            ? revision.timestamp
            : undefined,
        size: typeof revision.size === "number" ? revision.size : undefined,
        content: typeof content === "string" ? content : null,
      });
    }
    cursor = data.continue?.rvcontinue as string | undefined;
  } while (cursor);
  revisions.sort(
    (a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.revid - b.revid,
  );
  return revisions;
}

async function wiki(params: URLSearchParams): Promise<WikiResponse> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?${params}`,
      {
        headers: { "user-agent": AGENT, accept: "application/json" },
      },
    );
    if (response.status === 429) {
      await delay(3000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
    await delay(200);
    return (await response.json()) as WikiResponse;
  }
  throw new Error("Wikipedia HTTP 429");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WikiResponse {
  query?: {
    usercontribs?: Record<string, unknown>[];
    pages?: Array<{
      revisions?: Array<{
        revid?: number;
        parentid?: number;
        user?: string;
        timestamp?: string;
        size?: number;
        slots?: { main?: { content?: string } };
      }>;
    }>;
  };
  continue?: { uccontinue?: string; rvcontinue?: string };
}
