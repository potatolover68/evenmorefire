import { describe, expect, it } from "vitest";
import { cleanTaintedHistory, type Revision } from "../scrubber/index";
import { revisionsRoundTrip } from "../scrubber/provenance";

const prose: Revision[] = [
  { revid: 1, content: "Alpha beta." },
  { revid: 2, content: "Alpha beta. Gamma." },
  { revid: 3, content: "Alpha beta. Gamma. Delta." },
];

describe("invariants", () => {
  it("round-trips every revision in a history", () => {
    expect(() => revisionsRoundTrip(prose)).not.toThrow();
    expect(() =>
      revisionsRoundTrip([
        { revid: 1, content: "== Cast ==\n\nAlice meets Bob." },
        {
          revid: 2,
          content: "== Casting ==\n\nAlice meets Bob in the garden.",
        },
        { revid: 3, content: null },
        {
          revid: 4,
          content:
            "== Casting ==\n\nAlice meets Bob in the garden.\n\n== Production ==\n\nFilmed in Spain.",
        },
      ]),
    ).not.toThrow();
  });

  it("returns the exact final content when nothing is tainted", () => {
    const result = cleanTaintedHistory(prose, []);
    expect(result.content).toBe("Alpha beta. Gamma. Delta.");
    expect(result.explanations).toEqual([]);
  });

  it("keeps raw newlines when the tainted ids are absent", () => {
    const revisions = [{ revid: 1, content: "Hello\r\nworld" }];
    const result = cleanTaintedHistory(revisions, [99]);
    expect(result.content).toBe("Hello\r\nworld");
    expect(result.explanations.map((item) => item.action)).toEqual([
      "warn-unknown-revid",
    ]);
    expect(result.explanations[0]!.start).toEqual([0, 0]);
    expect(result.explanations[0]!.details).toEqual(["rev:99"]);
  });

  it("is deterministic", () => {
    const once = cleanTaintedHistory(prose, [3]);
    const twice = cleanTaintedHistory(prose, [3]);
    expect(twice).toEqual(once);
  });

  it("drops a tainted suffix that only adds text", () => {
    const result = cleanTaintedHistory(prose, [2, 3]);
    expect(result.content).toBe("Alpha beta.");
  });

  it("restores the last clean revision when a tainted suffix rewrites it", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Alpha beta." },
      { revid: 2, content: "Alpha beta!" },
    ];
    expect(cleanTaintedHistory(revisions, [2]).content).toBe("Alpha beta.");
  });

  it("round-trips random histories", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const words = ["Alpha", "Beta", "Gamma", "Delta", "Alice", "meets", "Bob"];
    let text = "Alpha meets Bob.";
    const revisions: Revision[] = [{ revid: 1, content: text }];
    for (let i = 2; i <= 12; i++) {
      if (rand() < 0.4)
        text += `\n\n${words[Math.floor(rand() * words.length)]} stays.`;
      else if (text.includes("Bob"))
        text = text.replace("Bob", rand() < 0.5 ? "Bob" : "Robert");
      revisions.push({ revid: i, content: text });
    }
    expect(() => revisionsRoundTrip(revisions)).not.toThrow();
    const once = cleanTaintedHistory(revisions, [4, 9]);
    expect(cleanTaintedHistory(revisions, [4, 9])).toEqual(once);
  });

  it("keeps a paragraph when a tainted edit only inserts a line and is reverted", () => {
    const paragraph = "A day after the attack, the governor called a meeting.";
    const image =
      "[[File:CJNG_Logo.svg|right|thumb|250x250px|Logo of the Jalisco New Generation Cartel (CJNG)]]";
    const parent = `${paragraph}\n\n== Background ==\n\nNext.\n`;
    const edited = `${paragraph}\n${image}\n\n== Background ==\n\nNext.\n`;
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: parent },
        { revid: 2, content: edited },
        { revid: 3, content: parent },
      ],
      [2],
    );
    expect(result.content).toBe(parent);
  });

  it("keeps a bot edit underneath a tainted suffix", () => {
    const clean = "Alpha.";
    const bottled = "Alpha. {{cite web|url=https://example.com}}";
    const tainted = `${bottled} Tainted.`;
    const revisions: Revision[] = [
      { revid: 1, content: clean },
      {
        revid: 2,
        content: bottled,
        user: "Zackbot",
        bot: true,
        comment: "fixing deprecated parameters",
      },
      { revid: 3, content: tainted, user: "Jvguidi" },
    ];
    expect(cleanTaintedHistory(revisions, [3]).content).toBe(bottled);
    expect(
      cleanTaintedHistory(revisions, [3], { keepBots: true }).content,
    ).toBe(bottled);
  });

  it("rolls through a bot edit in the middle of a tainted run", () => {
    const before = "Orders were 20.";
    const during = "Orders were 45.";
    const bottled = "Orders were 45. {{cite web|url=https://example.com}}";
    const after = "Orders were 30. {{cite web|url=https://example.com}}";
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: before },
        { revid: 2, content: during, user: "JannisGe" },
        {
          revid: 3,
          content: bottled,
          user: "AnomieBOT",
          bot: true,
          comment: "Substing templates: {{Internetquelle}}",
        },
        { revid: 4, content: after, user: "JannisGe" },
      ],
      [2, 4],
    );
    expect(result.content).toBe(before);
  });

  it("keeps a bot citation when bot edits must not be undone", () => {
    const before = "Orders were 20.";
    const during = "Orders were 45.";
    const bottled = "Orders were 45. {{cite web|url=https://example.com}}";
    const after = "Orders were 30. {{cite web|url=https://example.com}}";
    const revisions: Revision[] = [
      { revid: 1, content: before },
      { revid: 2, content: during, user: "JannisGe" },
      {
        revid: 3,
        content: bottled,
        user: "AnomieBOT",
        bot: true,
        comment: "Substing templates: {{Internetquelle}}",
      },
      { revid: 4, content: after, user: "JannisGe" },
    ];
    const result = cleanTaintedHistory(revisions, [2, 4], { keepBots: true });
    expect(result.content).toContain("{{cite web|url=https://example.com}}");
    expect(result.content).toContain("20");
    expect(result.content).not.toContain("45");
    expect(result.content).not.toContain("30");
  });

  it("rolls through IABot, Citation bot, reFill 2, and ProveIt", () => {
    const cases = [
      { tags: ["OAuth CID: 678"] },
      { tags: ["OAuth CID: 2922"] },
      { comment: "Filled in 2 bare reference(s) with reFill 2" },
      {
        comment: "Reference edited with [[Wikipedia:ProveIt|ProveIt]] #proveit",
      },
    ];
    for (const maintenance of cases) {
      const result = cleanTaintedHistory(
        [
          { revid: 1, content: "Alpha." },
          { revid: 2, content: "Alpha. Tainted." },
          { revid: 3, content: "Alpha. Tainted. Maintained.", ...maintenance },
          { revid: 4, content: "Alpha. Tainted. Maintained. Later." },
        ],
        [2, 4],
      );
      expect(result.content).toBe("Alpha.");
    }
  });

  it("rolls through a reFill edit but stops at another editor", () => {
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: "Alpha." },
        { revid: 2, content: "Alpha. Tainted." },
        {
          revid: 3,
          content: "Alpha. Tainted.<ref>https://example.com</ref>",
          user: "Someone",
          comment: "Refilled 1 reference using reFill",
        },
        {
          revid: 4,
          content: "Alpha. Tainted.<ref>https://example.com</ref> More.",
        },
      ],
      [2, 4],
    );
    expect(result.content).toBe("Alpha.");
    const stopped = cleanTaintedHistory(
      [
        { revid: 1, content: "Alpha." },
        { revid: 2, content: "Alpha. Tainted." },
        { revid: 3, content: "Alpha. Tainted. Noted.", user: "Ich-Du-De" },
        { revid: 4, content: "Alpha. Tainted. Noted. Later." },
      ],
      [2, 4],
    );
    expect(stopped.content).not.toBe("Alpha.");
  });

  it("rolls back when every tainted edit is among the latest", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Alpha." },
      { revid: 2, content: "Alpha. Beta." },
      { revid: 3, content: "Alpha. Beta. Gamma." },
    ];
    const result = cleanTaintedHistory(revisions, [2, 3]);
    expect(result.content).toBe("Alpha.");
    expect(result.explanations.map((item) => item.details?.[0])).toEqual([
      "rev:2",
      "rev:3",
    ]);
  });

  it("stops a rollback at a tainted exact revert", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Hello." },
      { revid: 2, content: "Hello. VANDAL" },
      { revid: 3, content: "Hello." },
      { revid: 4, content: "Hello. Again." },
    ];
    const result = cleanTaintedHistory(revisions, [3, 4]);
    expect(result.content).toBe("Hello.");
    expect(
      result.explanations.some(
        (item) =>
          item.action === "kept-tainted-revert" &&
          item.details?.includes("rev:3"),
      ),
    ).toBe(true);
    expect(
      result.explanations.some(
        (item) =>
          item.action === "remove-tainted" && item.details?.includes("rev:4"),
      ),
    ).toBe(true);
  });

  it("keeps a latest tainted exact revert instead of restoring vandalism", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Hello." },
      { revid: 2, content: "Hello. VANDAL" },
      { revid: 3, content: "Hello." },
    ];
    const result = cleanTaintedHistory(revisions, [3]);
    expect(result.content).toBe("Hello.");
    expect(
      result.explanations.some((item) => item.action === "kept-tainted-revert"),
    ).toBe(true);
  });

  it("drops a citation rewrite that shares a sentence with tainted prose", () => {
    const cite =
      "<ref>{{cite web|url=https://example.com/values/t/3939/n6/5000807/p/2023/c79/2670/v/105|title=Municipal livestock survey|publisher=IBGE}}</ref>";
    const rewritten =
      "<ref>{{cite web|url=https://example.com/values/t/3939/n6/5000807/p/2023/c79/2670/v/105|title=Municipal livestock survey|publisher=IBGE|trans-title=Pesquisa da pecuaria municipal|archive-url=https://web.archive.org/web/20240101000000/https://example.com/values/t/3939|archive-date=1 January 2024|access-date=1 June 2024}}</ref>";
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: `The cattle herd was 227106 head.${cite}` },
        { revid: 2, content: `The cattle herd was 227106 head.${rewritten}` },
      ],
      [1],
    );
    expect(result.content).not.toContain("227106");
    expect(result.content).not.toContain("cite web");
    expect(result.content).not.toContain("trans-title");
  });

  it("drops a tainted infobox parameter when the later edit only rewrites its ref", () => {
    const before = `{{Infobox settlement
| leader_name = Rafael Hamamoto<ref>{{cite web|title=Elections|url=https://example.com}}</ref>
}}`;
    const after = `{{Infobox settlement
| leader_name = Rafael Hamamoto<ref>{{cite web|title=Elections|url=https://example.com|trans-title=Elections}}</ref>
}}`;
    const result = cleanTaintedHistory(
      [
        { revid: 1, content: before },
        { revid: 2, content: after },
      ],
      [1],
      { untaintedTemplates: false },
    );
    expect(result.content).not.toContain("Rafael");
    expect(result.content).not.toContain("trans-title");
  });

  it("leaves a reference-only sentence unscored", () => {
    const result = cleanTaintedHistory(
      [
        {
          revid: 1,
          content:
            "<ref>{{cite web|title=Survey|url=https://example.com}}</ref>",
        },
        {
          revid: 2,
          content:
            "<ref>{{cite web|title=Inquiry|url=https://example.com}}</ref>",
        },
      ],
      [1],
    );
    expect(result.content).toContain("Inquiry");
  });

  it("keeps a tainted exact revert from restoring vandalism", () => {
    const revisions: Revision[] = [
      { revid: 1, content: "Hello." },
      { revid: 2, content: "Hello. VANDAL" },
      { revid: 3, content: "Hello." },
      { revid: 4, content: "Hello. More." },
    ];
    const result = cleanTaintedHistory(revisions, [3]);
    expect(result.content).toBe("Hello. More.");
    expect(
      result.explanations.some(
        (item) =>
          item.action === "kept-tainted-revert" &&
          item.details?.includes("rev:3"),
      ),
    ).toBe(true);
  });
});
