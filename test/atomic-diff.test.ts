import { describe, expect, it } from "vitest";
import {
  alignSentences,
  atomicEdits,
  symbolKeys,
} from "../scrubber/atomic-diff";
import { SENTENCE_REUSE_THRESHOLD } from "../scrubber/types";
import { splitDocument } from "../scrubber/split";

function symbols(text: string): string[] {
  const sentence = splitDocument(text).paragraphs[0]!.sentences[0]!;
  return symbolKeys(
    sentence.tokens.map((token) => ({
      value: token.value,
      gapAfter: token.gapAfter,
    })),
  );
}

function tokens(text: string) {
  const sentence = splitDocument(text).paragraphs[0]!.sentences[0]!;
  return sentence.tokens.map((token) => ({
    value: token.value,
    gapAfter: token.gapAfter,
  }));
}

describe("atomic diffs", () => {
  it("replaces a changed wikilink without reusing its brackets", () => {
    const edits = atomicEdits(
      tokens("See [[Cat]] today."),
      tokens("See [[Dog]] today."),
    );
    const deleted = edits.find((edit) => edit.type === "delete");
    const inserted = edits.find((edit) => edit.type === "insert");
    expect(deleted).toBeTruthy();
    expect(inserted).toBeTruthy();
    const oldLink = tokens("See [[Cat]] today.").slice(
      deleted!.aStart,
      deleted!.aEnd,
    );
    const newLink = tokens("See [[Dog]] today.").slice(
      inserted!.bStart,
      inserted!.bEnd,
    );
    expect(oldLink.map((token) => token.value).join("")).toBe("[[Cat]]");
    expect(newLink.map((token) => token.value).join("")).toBe("[[Dog]]");
  });

  it("keeps an unchanged template as one equal span", () => {
    const before = tokens("{{note|Alpha}} stays.");
    const edits = atomicEdits(before, tokens("{{note|Alpha}} stays."));
    expect(edits).toEqual([
      {
        type: "equal",
        aStart: 0,
        aEnd: before.length,
        bStart: 0,
        bEnd: before.length,
      },
    ]);
  });

  it("pairs a small edit and leaves a rewrite unmatched", () => {
    const cat = symbols("The cat sat.");
    const dog = symbols("The dog sat.");
    const rewrite = symbols(
      "A long rewritten sentence about something else entirely.",
    );
    const aligned = alignSentences([cat, rewrite], [dog, rewrite]);
    expect(aligned.pairs).toEqual([
      { prev: 0, curr: 0 },
      { prev: 1, curr: 1 },
    ]);
    const moved = alignSentences(
      [symbols("Alpha stays here.")],
      [symbols("Beta gamma delta epsilon zeta eta theta iota.")],
    );
    expect(moved.pairs).toEqual([]);
    expect(SENTENCE_REUSE_THRESHOLD).toBe(0.6);
  });

  it("treats a heading as one symbol", () => {
    expect(symbols("== History ==")).toHaveLength(1);
  });
});
