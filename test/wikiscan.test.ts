import { describe, expect, it } from "vitest";
import { splitDocument } from "../scrubber/split";
import {
  normalizeRefName,
  outermostAtomic,
  scanTokens,
  type ScanToken,
} from "../scrubber/wikiscan";

function tokensOf(text: string): ScanToken[] {
  const doc = splitDocument(text);
  const out: ScanToken[] = [];
  let id = 1;
  for (const para of doc.paragraphs) {
    for (const sent of para.sentences) {
      for (const tok of sent.tokens) {
        out.push({ id: id++, text: tok.value, gapAfter: tok.gapAfter });
      }
    }
  }
  return out;
}

describe("wikiscan", () => {
  it("pairs templates, links, comments, and tables", () => {
    const tokens = tokensOf(
      '{{note|a}} and [[Link]] <!--hi--> {| class="x"\n|-\n| c\n|}',
    );
    const scan = scanTokens(tokens);
    const kinds = scan.pairs.map((p) => p.kind).sort();
    expect(kinds).toEqual(["comment", "link", "table", "template"]);
  });

  it("distinguishes ref definitions and uses", () => {
    const tokens = tokensOf(
      "A<ref name=\"Smith 2010\">Page 1</ref> B<ref name='Smith 2010'/>.",
    );
    const scan = scanTokens(tokens);
    const named = scan.refs.filter((r) => r.name === "Smith 2010");
    expect(named.map((r) => r.kind).sort()).toEqual(["def", "use"]);
    const def = named.find((r) => r.kind === "def")!;
    const text = def.tokenIds
      .map((id) => tokens.find((t) => t.id === id)!.text)
      .join("");
    expect(text).toContain("ref");
    expect(text).toContain("Page");
    expect(def.contentTokenIds.length).toBeGreaterThan(0);
  });

  it("marks list-defined refs inside references tags", () => {
    const tokens = tokensOf(
      '<references>\n<ref name="a">Body</ref>\n</references>',
    );
    const scan = scanTokens(tokens);
    expect(
      scan.refs.some(
        (r) => r.kind === "def" && r.name === "a" && r.listDefined,
      ),
    ).toBe(true);
  });

  it("strips quotes and surrounding whitespace from ref names", () => {
    expect(normalizeRefName('  "Smith"  ')).toBe("Smith");
    expect(normalizeRefName("'a'")).toBe("a");
  });

  it("pairs an external link and keeps an unclosed template open", () => {
    const linked = tokensOf("See [https://example.com/a label].");
    const scan = scanTokens(linked);
    expect(scan.pairs.some((pair) => pair.kind === "extlink")).toBe(true);
    const spans = outermostAtomic(linked);
    expect(spans).toHaveLength(1);
    const open = tokensOf("{{Infobox\n| a = 1");
    expect(scanTokens(open).unclosed.map((frame) => frame.kind)).toEqual([
      "template",
    ]);
    expect(outermostAtomic(open)[0]).toEqual({ start: 0, end: open.length });
  });

  it("aligns the interior of a multiline template that contains a ref", () => {
    const tokens = tokensOf(
      "{{Infobox\n| name = Rafael<ref>{{cite web|title=Elections}}</ref>\n}}",
    );
    const spans = outermostAtomic(tokens);
    const rafael = tokens.findIndex((token) => token.text === "Rafael");
    expect(rafael).toBeGreaterThan(-1);
    expect(
      spans.some((span) => rafael >= span.start && rafael < span.end),
    ).toBe(false);
    const ref = spans.find((span) =>
      tokens.slice(span.start, span.end).some((token) => token.text === "ref"),
    );
    expect(ref).toBeTruthy();
    expect(
      spans.some((span) => span.start === 0 && span.end === tokens.length),
    ).toBe(false);

    const plain = tokensOf("{{Infobox\n| a = 1\n}}");
    expect(outermostAtomic(plain)).toEqual([{ start: 0, end: plain.length }]);
    const inline = tokensOf("{{note|<ref>x</ref>}}");
    expect(outermostAtomic(inline)).toEqual([{ start: 0, end: inline.length }]);
    const note = tokensOf("{{note|Alpha}}");
    expect(outermostAtomic(note)).toEqual([{ start: 0, end: note.length }]);
  });

  it("does not look inside nowiki", () => {
    const tokens = tokensOf("<nowiki>{{not a template}}</nowiki>{{real}}");
    const scan = scanTokens(tokens);
    expect(scan.pairs.filter((p) => p.kind === "template")).toHaveLength(1);
  });
});
