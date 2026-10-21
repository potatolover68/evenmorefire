import { describe, expect, it } from "vitest";
import {
  normalizeNewlines,
  renderSplit,
  splitDocument,
} from "../scrubber/split";

function roundTrip(text: string): void {
  const norm = normalizeNewlines(text);
  const doc = splitDocument(norm);
  expect(renderSplit(doc)).toBe(norm);
  let cursor = doc.leadingGap.length;
  for (const para of doc.paragraphs) {
    expect(para.key).toBe(para.key.trim());
    for (const sent of para.sentences) {
      expect(sent.key).toBe(sent.tokens.map((t) => t.value).join(" "));
      for (const tok of sent.tokens) {
        expect(norm.slice(tok.start, tok.end)).toBe(tok.value);
        expect(cursor).toBe(tok.start);
        cursor = tok.end + tok.gapAfter.length;
      }
    }
  }
  expect(cursor).toBe(norm.length);
}

describe("splitDocument", () => {
  it("round-trips prose, markup, and newlines", () => {
    const samples = [
      "",
      "Hello",
      "Hello world.",
      "Hello. World!",
      "Hello.\nWorld",
      "Hello\n\nWorld",
      "Hello\n\n\nWorld",
      "\n\nHello",
      "Hello\n\n",
      "  Hello  ",
      "foo{|bar",
      "foo|}bar",
      "foo|}\nbar",
      '{| class="x"\n|-\n| cell\n|}',
      "before\n|-\nafter",
      'a<table class="x">b</table>c',
      "a<TABLE>b</TABLE>c",
      "a<tr>b</tr>c",
      "See http://example.com/a.b now.",
      "Visit https://en.wikipedia.org/wiki/A|B next",
      "foo <!-- hidden --> bar",
      "Word <ref>cite</ref> more.",
      'Use <ref name="a"/> here.',
      "[[Link]] and {{tmpl|a}}",
      "e.g. this stays",
      "Yes. Split",
      "A\tB",
      "Hello; world",
      "What? Yes!",
      "Note: thing",
      "Café naïve 42_id",
      "== Plot ==\n\nAlice meets Bob.",
      "Intro.\r\n\r\nTail.",
    ];
    for (const sample of samples) roundTrip(sample);
  });

  it("splits paragraphs on blank lines and table markup", () => {
    const doc = splitDocument("Intro\n\n== Plot ==\n\nAlice.");
    expect(doc.paragraphs.map((p) => p.key)).toEqual([
      "Intro",
      "== Plot ==",
      "Alice.",
    ]);
  });

  it("keeps a duplicated paragraph as two objects with the same key", () => {
    const doc = splitDocument("Alpha.\n\nAlpha.");
    expect(doc.paragraphs).toHaveLength(2);
    expect(doc.paragraphs[0]!.key).toBe(doc.paragraphs[1]!.key);
  });

  it("puts URL text in its own sentence and keeps the dot-space rule", () => {
    const doc = splitDocument("See http://example.com/a.b now. Next.");
    const sentences = doc.paragraphs[0]!.sentences;
    const surfaces = sentences.map((s) =>
      s.tokens.map((t) => t.value).join(""),
    );
    expect(surfaces).toContain("http://example.com/a.b");
    expect(sentences[sentences.length - 1]!.key).toBe("Next .");
  });

  it("does not split e.g. and does split a real sentence", () => {
    expect(
      splitDocument("e.g. this stays").paragraphs[0]!.sentences,
    ).toHaveLength(1);
    expect(splitDocument("Yes. Split").paragraphs[0]!.sentences).toHaveLength(
      2,
    );
  });

  it("keeps a multiline template together and still splits the following prose", () => {
    const doc = splitDocument("{{Infobox\n| a = [[Place]]\n}}\nNext sentence.");
    const sentences = doc.paragraphs.flatMap((paragraph) =>
      paragraph.sentences.map((sentence) =>
        sentence.tokens.map((token) => token.value).join(""),
      ),
    );
    expect(sentences[0]).toContain("{{");
    expect(sentences[0]).toContain("}}");
    expect(sentences.some((sentence) => sentence.includes("Next"))).toBe(true);
    const boxed = splitDocument("{{box\n\n| a = 1\n}}\n\nAfter.");
    expect(boxed.paragraphs).toHaveLength(2);
    expect(boxed.paragraphs[0]!.key).toContain("{{box");
    expect(boxed.paragraphs[1]!.key).toBe("After.");
  });

  it("tokenizes multi-char wiki marks ahead of symbols", () => {
    const doc = splitDocument("[[A]] {{B}} <!--c--> x_y");
    const values = doc.paragraphs[0]!.sentences.flatMap((s) =>
      s.tokens.map((t) => t.value),
    );
    expect(values).toContain("[[");
    expect(values).toContain("]]");
    expect(values).toContain("{{");
    expect(values).toContain("}}");
    expect(values).toContain("<!--");
    expect(values).toContain("-->");
    expect(values).toContain("_");
    expect(values).not.toContain("[[A]]");
  });
});
