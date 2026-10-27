import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanTaintedHistory,
  scrubAnalysis,
  scrubRollback,
} from "../scrubber/index.ts";
import { openAnalysis } from "../scrubber/provenance.ts";
import { revertRevids, trivialRollback } from "../scrubber/replay.ts";
import { clearParagraphCache, paragraphCacheSize } from "../scrubber/split.ts";
import type { Revision } from "../scrubber/types.ts";
import { DEFAULT_OPTIONS } from "../scrubber/types.ts";
import {
  bodyStorageKey,
  loadBodyFrom,
  loadSessionFrom,
  releaseIdleContentFrom,
  saveSessionTo,
  type SessionDepot,
} from "../userscript/session.ts";
import {
  emptySession,
  type PageJob,
  type Session,
} from "../userscript/types.ts";

function memoryDepot(): SessionDepot {
  const sessions = new Map<string, Session>();
  const bodies = new Map<string, string>();
  return {
    async getSession(key) {
      const value = sessions.get(key);
      return value ? structuredClone(value) : undefined;
    },
    async putSession(session) {
      sessions.set(session.key, structuredClone(session));
    },
    async getBody(key) {
      return bodies.get(key);
    },
    async putBody(key, content) {
      bodies.set(key, content);
    },
    async deleteSession(key) {
      sessions.delete(key);
    },
    async deleteBodies(sessionKey) {
      const prefix = `${sessionKey}\0`;
      for (const key of [...bodies.keys()]) {
        if (key.startsWith(prefix)) bodies.delete(key);
      }
    },
  };
}

function job(title: string, content: string | null): PageJob {
  return {
    title,
    status: "review",
    taintedRevids: [1],
    isNew: false,
    pageid: null,
    anchorRevid: null,
    content,
    explanations: [],
    baseRevid: null,
    baseTimestamp: null,
    savedRevid: null,
  };
}

describe("scrub memory", () => {
  it("drops the paragraph cache after a scrub", () => {
    cleanTaintedHistory(
      [
        { revid: 1, content: "Alpha beta." },
        { revid: 2, content: "Alpha gamma." },
      ],
      [2],
    );
    expect(paragraphCacheSize()).toBe(0);
  });

  it("folds a page the same way as the array scrub", () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL("./fixtures/markup-rewrite.json", import.meta.url),
        "utf8",
      ),
    ) as { revisions: Revision[]; tainted: number[] };
    const direct = cleanTaintedHistory(fixture.revisions, fixture.tainted);
    const tainted = new Set(
      fixture.tainted.filter((id) =>
        fixture.revisions.some((revision) => revision.revid === id),
      ),
    );
    const folder = openAnalysis(tainted, DEFAULT_OPTIONS.restoreAnchorWindow);
    for (const revision of fixture.revisions) folder.push(revision);
    const folded = scrubAnalysis(
      fixture.revisions,
      fixture.tainted,
      folder.finish(),
      revertRevids(fixture.revisions),
    );
    clearParagraphCache();
    expect(folded.content).toBe(direct.content);
    const rollback = trivialRollback(
      fixture.revisions,
      tainted,
      revertRevids(fixture.revisions),
    );
    expect(rollback?.content).toBe(direct.content);
    expect(
      scrubRollback(
        fixture.revisions,
        fixture.tainted,
        rollback!,
        rollback!.content ?? "",
      ),
    ).toEqual(direct);
  });

  it("matches the array scrub when an older tainted edit needs the full fold", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Alpha.\n\nBeta." },
      { revid: 2, content: "Tainted.\n\nBeta." },
      { revid: 3, content: "Tainted.\n\nGamma." },
    ];
    const direct = cleanTaintedHistory(revisions, [2]);
    const folder = openAnalysis(
      new Set([2]),
      DEFAULT_OPTIONS.restoreAnchorWindow,
    );
    for (const revision of revisions) folder.push(revision);
    const folded = scrubAnalysis(
      revisions,
      [2],
      folder.finish(),
      revertRevids(revisions),
    );
    clearParagraphCache();
    expect(folded).toEqual(direct);
  });

  it("detects reverts from sha1 metadata without keeping wikitext", () => {
    const loaded: Revision[] = [
      { revid: 1, content: "Alpha." },
      { revid: 2, content: "Tainted." },
    ];
    const meta: Revision[] = loaded.map((revision) => ({
      revid: revision.revid,
      content: null,
      sha1: revision.content ?? "",
    }));
    const reverted: Revision[] = [...loaded, { revid: 3, content: "Alpha." }];
    const revertedMeta: Revision[] = reverted.map((revision) => ({
      revid: revision.revid,
      content: null,
      sha1: revision.content ?? "",
    }));
    expect([...revertRevids(revertedMeta)]).toEqual([
      ...revertRevids(reverted),
    ]);
    expect([...revertRevids(meta)]).toEqual([...revertRevids(loaded)]);
    expect(
      trivialRollback(meta, new Set([2]), revertRevids(meta)),
    ).toMatchObject({
      keptRevid: 1,
      content: null,
      undone: [2],
      emptied: false,
    });
    expect(
      trivialRollback(loaded, new Set([2]), revertRevids(loaded))?.content,
    ).toBe("Alpha.");
  });

  it("remembers only the revert lookback window", () => {
    const revisions: Revision[] = [];
    for (let i = 1; i <= 30; i++) {
      revisions.push({ revid: i, content: `v${i}` });
    }
    revisions.push({ revid: 31, content: "v1" });
    revisions.push({ revid: 32, content: "v20" });
    const reverts = revertRevids(revisions);
    expect(reverts.has(31)).toBe(false);
    expect(reverts.has(32)).toBe(true);
  });
});

describe("session bodies", () => {
  it("restores a proposal from the bodies store while the session record has no text", async () => {
    const depot = memoryDepot();
    const written = new WeakMap<PageJob, string>();
    const session = emptySession("enwiki:Example");
    session.jobs.Example = job("Example", "Hello page");
    await saveSessionTo(depot, session, written);
    const stored = await depot.getSession(session.key);
    expect(stored?.jobs.Example?.content).toBeNull();
    expect(await loadBodyFrom(depot, session.key, "Example")).toBe(
      "Hello page",
    );
    expect(bodyStorageKey(session.key, "Example")).toContain("Example");
    releaseIdleContentFrom(session, null, written);
    expect(session.jobs.Example?.content).toBeNull();
    const loaded = await loadSessionFrom(depot, session.key);
    expect(loaded?.jobs.Example?.content).toBeNull();
    expect(await loadBodyFrom(depot, session.key, "Example")).toBe(
      "Hello page",
    );
  });

  it("moves inline text from an older session into the bodies store", async () => {
    const depot = memoryDepot();
    const session = emptySession("k");
    session.jobs.T = job("T", "body text");
    await depot.putSession(structuredClone(session));
    const loaded = await loadSessionFrom(depot, "k");
    expect(loaded?.jobs.T?.content).toBe("body text");
    await saveSessionTo(depot, loaded!, new WeakMap());
    expect((await depot.getSession("k"))?.jobs.T?.content).toBeNull();
    expect(await loadBodyFrom(depot, "k", "T")).toBe("body text");
  });
});
