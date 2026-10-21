import { describe, expect, it } from "vitest";
import { myersDiff, type Edit } from "../scrubber/myers";

function apply<T>(a: readonly T[], b: readonly T[], edits: Edit[]): T[] {
  const out: T[] = [];
  let ai = 0;
  let bi = 0;
  for (const edit of edits) {
    expect(edit.aStart).toBe(ai);
    expect(edit.bStart).toBe(bi);
    if (edit.type === "equal") {
      for (let i = edit.aStart; i < edit.aEnd; i++) {
        expect(a[i]).toBe(b[edit.bStart + (i - edit.aStart)]);
      }
      out.push(...a.slice(edit.aStart, edit.aEnd));
      ai = edit.aEnd;
      bi = edit.bEnd;
    } else if (edit.type === "delete") {
      expect(edit.bStart).toBe(edit.bEnd);
      ai = edit.aEnd;
    } else {
      expect(edit.aStart).toBe(edit.aEnd);
      out.push(...b.slice(edit.bStart, edit.bEnd));
      bi = edit.bEnd;
    }
  }
  expect(ai).toBe(a.length);
  expect(bi).toBe(b.length);
  return out;
}

function assertScript<T>(a: readonly T[], b: readonly T[]): void {
  const edits = myersDiff(a, b);
  expect(apply(a, b, edits)).toEqual([...b]);
}

describe("myersDiff", () => {
  it("handles empty and identical inputs", () => {
    expect(myersDiff([], [])).toEqual([]);
    expect(myersDiff([], ["a", "b"])).toEqual([
      { type: "insert", aStart: 0, aEnd: 0, bStart: 0, bEnd: 2 },
    ]);
    expect(myersDiff(["a", "b"], [])).toEqual([
      { type: "delete", aStart: 0, aEnd: 2, bStart: 0, bEnd: 0 },
    ]);
    expect(myersDiff(["a", "b"], ["a", "b"])).toEqual([
      { type: "equal", aStart: 0, aEnd: 2, bStart: 0, bEnd: 2 },
    ]);
  });

  it("diffs insertions, deletions, and replacements", () => {
    assertScript(["a", "b", "c"], ["a", "x", "c"]);
    assertScript(["a", "b", "c"], ["a", "b", "c", "d"]);
    assertScript(["a", "b", "c"], ["b", "c"]);
    assertScript(["a", "b"], ["b", "a"]);
    assertScript([1, 2, 3], [3, 1, 2]);
  });

  it("reproduces the target for random arrays", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let n = 0; n < 40; n++) {
      const lenA = Math.floor(rand() * 30);
      const lenB = Math.floor(rand() * 30);
      const a = Array.from({ length: lenA }, () => Math.floor(rand() * 6));
      const b = Array.from({ length: lenB }, () => Math.floor(rand() * 6));
      assertScript(a, b);
    }
  });
});
