import {
  alignSentences,
  atomicEdits,
  symbolKeys,
  type TextToken,
} from "./atomic-diff";
import { myersDiff, type Edit } from "./myers";
import {
  materializeParagraph,
  normalizeNewlines,
  paragraphSpans,
  simpleParagraphs,
  type ParaSpan,
  type SplitParagraph,
  type SplitSentence,
} from "./split";
import { scanTokens } from "./wikiscan";
import type {
  Hunk,
  ParagraphObj,
  ParaphraseNote,
  Revision,
  SavedRef,
  SentenceObj,
  Token,
} from "./types";
import { MYERS_TOKEN_CAP } from "./types";

export interface SourceSeq {
  revid: number;
  tokens: Token[];
}

export interface Analysis {
  finalRevid: number | null;
  finalText: string;
  finalLeading: string;
  finalTokens: Token[];
  finalGapAfter: Map<number, string>;
  finalSentences: Token[][];
  hunks: Hunk[];
  taintedMoves: number[];
  paraphrase: ParaphraseNote[];
  tokensById: Map<number, Token>;
  sources: SourceSeq[];
  savedRefs: SavedRef[];
  /** Revid of the revision a tainted edit was applied on top of, oldest first. */
  sourceRevids: number[];
}

interface RevState {
  revid: number;
  text: string;
  leadingGap: string;
  paragraphs: ParagraphObj[];
  gapAfter: Map<number, string>;
}

export function analyze(
  revisions: readonly Revision[],
  tainted: ReadonlySet<number>,
  anchorWindow: number,
): Analysis {
  const paragraphsByKey = new Map<string, ParagraphObj[]>();
  const sentencesByKey = new Map<string, SentenceObj[]>();
  const tokensById = new Map<number, Token>();
  const hunks: Hunk[] = [];
  const taintedMoves: number[] = [];
  const paraphrase: ParaphraseNote[] = [];
  const savedRefs: SavedRef[] = [];
  const sources: SourceSeq[] = [];
  const sourceRevids: number[] = [];
  let nextId = 1;
  let gen = 0;
  let prev: RevState | null = null;
  let prevGapById = new Map<number, string>();
  let currentRevid = 0;
  /** Pre-taint gapAfter for tokens a tainted edit reflowed but did not create. */
  const restoredGaps = new Map<number, string>();
  const noteGapEdits = (paragraphs: readonly ParagraphObj[]) => {
    const curr = gapMap(paragraphs, gapsOf);
    if (!tainted.has(currentRevid)) {
      for (const id of curr.keys()) restoredGaps.delete(id);
      return;
    }
    for (const [id, gap] of curr) {
      const token = tokensById.get(id);
      if (!token || token.origin === currentRevid) {
        restoredGaps.delete(id);
        continue;
      }
      const old = prevGapById.get(id);
      if (old !== undefined && old !== gap && !restoredGaps.has(id)) {
        restoredGaps.set(id, old);
      }
    }
  };
  let last: RevState | null = null;
  const paraSeen = new WeakMap<ParagraphObj, number>();
  const paraSignature = new WeakMap<ParagraphObj, string>();
  const gapsOf = new WeakMap<ParagraphObj, string[]>();
  const regionOf = new WeakMap<
    ParagraphObj,
    { text: string; start: number; end: number; after: string }
  >();

  const createToken = (value: string, origin: number): Token => {
    const token: Token = {
      id: nextId++,
      value,
      origin,
      events: [],
      lastSeenRev: origin,
      claimedGen: gen,
    };
    tokensById.set(token.id, token);
    return token;
  };

  const claimToken = (token: Token) => {
    token.claimedGen = gen;
  };
  const claimSentence = (sentence: SentenceObj) => {
    sentence.claimedGen = gen;
    for (const token of sentence.tokens) claimToken(token);
  };
  const claimParagraph = (paragraph: ParagraphObj) => {
    paragraph.claimedGen = gen;
    for (const sentence of paragraph.sentences) claimSentence(sentence);
  };
  const paragraphClaimable = (paragraph: ParagraphObj) => {
    if (paragraph.claimedGen === gen) return false;
    return paragraph.sentences.every(
      (sentence) =>
        sentence.claimedGen !== gen &&
        sentence.tokens.every((token) => token.claimedGen !== gen),
    );
  };
  const sentenceClaimable = (sentence: SentenceObj) =>
    sentence.claimedGen !== gen &&
    sentence.tokens.every((token) => token.claimedGen !== gen);

  const registerParagraph = (paragraph: ParagraphObj) => {
    const list = paragraphsByKey.get(paragraph.key);
    if (list) list.push(paragraph);
    else paragraphsByKey.set(paragraph.key, [paragraph]);
  };
  const registerSentence = (sentence: SentenceObj) => {
    const list = sentencesByKey.get(sentence.key);
    if (list) list.push(sentence);
    else sentencesByKey.set(sentence.key, [sentence]);
  };

  const textOf = (token: Token): TextToken => ({
    value: token.value,
    gapAfter: prevGapById.get(token.id) ?? "",
  });

  const weave = (
    prevTokens: readonly Token[],
    currTokens: readonly TextToken[],
    revid: number,
    placedRow: Token[],
    removed: number[] | null,
    inserted: number[] | null,
  ) => {
    for (const edit of atomicEdits(prevTokens.map(textOf), currTokens)) {
      if (edit.type === "equal") {
        for (let k = edit.aStart; k < edit.aEnd; k++) {
          const local = edit.bStart + (k - edit.aStart);
          const token = prevTokens[k]!;
          if (token.value === currTokens[local]!.value) {
            claimToken(token);
            placedRow[local] = token;
          } else {
            const created = createToken(currTokens[local]!.value, revid);
            placedRow[local] = created;
            inserted?.push(created.id);
          }
        }
      } else if (edit.type === "delete") {
        if (!removed) continue;
        for (let k = edit.aStart; k < edit.aEnd; k++) {
          const token = prevTokens[k]!;
          if (tainted.has(token.origin)) removed.push(token.id);
        }
      } else {
        for (let k = edit.bStart; k < edit.bEnd; k++) {
          const created = createToken(currTokens[k]!.value, revid);
          placedRow[k] = created;
          inserted?.push(created.id);
        }
      }
    }
  };

  const retokenize = (
    previous: ParagraphObj,
    split: SplitParagraph,
    revid: number,
  ): ParagraphObj => {
    const currSides: TextToken[][] = split.sentences.map((sentence) =>
      sentence.tokens.map((token) => ({
        value: token.value,
        gapAfter: token.gapAfter,
      })),
    );
    const alignment = alignSentences(
      previous.sentences
        .map((sentence) => sentence.tokens.map(textOf))
        .map((tokens) => symbolKeys(tokens)),
      currSides.map((tokens) => symbolKeys(tokens)),
    );
    const placed: Token[][] = currSides.map(
      (tokens) => new Array<Token>(tokens.length),
    );
    for (const pair of alignment.pairs) {
      weave(
        previous.sentences[pair.prev]!.tokens,
        currSides[pair.curr]!,
        revid,
        placed[pair.curr]!,
        null,
        null,
      );
    }
    for (const index of alignment.inserted) {
      const currTokens = currSides[index]!;
      for (let k = 0; k < currTokens.length; k++) {
        placed[index]![k] = createToken(currTokens[k]!.value, revid);
      }
    }
    const prevTokens = previous.sentences.flatMap(
      (sentence) => sentence.tokens,
    );
    const prevIds = new Set(prevTokens.map((token) => token.id));
    const sentences: SentenceObj[] = split.sentences.map((sentence, si) => {
      const tokens = placed[si] ?? [];
      if (tokens.some((token) => !token))
        throw new Error(`unfilled token in revision ${revid}`);
      for (const token of tokens) {
        if (
          token.origin !== revid &&
          !prevIds.has(token.id) &&
          token.lastSeenRev !== prev!.revid
        ) {
          token.events.push({ rev: revid, kind: "in" });
        }
        token.lastSeenRev = revid;
      }
      const obj: SentenceObj = { key: sentence.key, tokens, claimedGen: gen };
      registerSentence(obj);
      return obj;
    });
    const paragraph: ParagraphObj = {
      key: split.key,
      sentences,
      claimedGen: gen,
    };
    registerParagraph(paragraph);
    return paragraph;
  };

  const tryPositional = (text: string, revid: number): boolean => {
    if (!prev) return false;
    const simple = simpleParagraphs(text);
    if (
      !simple ||
      simple.paras.length !== prev.paragraphs.length ||
      simple.leadingGap !== prev.leadingGap
    )
      return false;
    const mismatch: number[] = [];
    for (let i = 0; i < simple.paras.length; i++) {
      const region = regionOf.get(prev.paragraphs[i]!);
      const para = simple.paras[i]!;
      if (
        !region ||
        region.after !== para.after ||
        !sameChars(
          region.text,
          region.start,
          region.end,
          text,
          para.keyStart,
          para.keyEnd,
        )
      ) {
        mismatch.push(i);
        if (mismatch.length > 1) return false;
      }
    }
    const mismatchSet = new Set(mismatch);
    const curr = prev.paragraphs.slice();
    for (let i = 0; i < curr.length; i++) {
      if (mismatchSet.has(i)) continue;
      const paragraph = curr[i]!;
      paragraph.claimedGen = gen;
      for (const sentence of paragraph.sentences) sentence.claimedGen = gen;
      paraSeen.set(paragraph, revid);
    }
    for (const index of mismatch) {
      const previous = prev.paragraphs[index]!;
      const spec = simple.paras[index]!;
      const key = text.slice(spec.keyStart, spec.keyEnd);
      const span: ParaSpan = {
        key,
        base: spec.keyStart,
        before: "",
        after: spec.after,
        signature: "",
      };
      const split = materializeParagraph(span);
      const paragraph = retokenize(previous, split, revid);
      rememberGaps(split, paragraph, gapsOf, revid);
      noteGapEdits([paragraph]);
      paraSignature.set(paragraph, `${key.length}:${key}${spec.after}`);
      regionOf.set(paragraph, {
        text,
        start: spec.keyStart,
        end: spec.keyEnd,
        after: spec.after,
      });
      paraSeen.set(paragraph, revid);
      curr[index] = paragraph;
      for (const sentence of previous.sentences) {
        if (sentence.claimedGen === gen) continue;
        for (const token of sentence.tokens) {
          if (token.claimedGen !== gen)
            token.events.push({ rev: revid, kind: "out" });
        }
      }
    }
    const state: RevState = {
      revid,
      text,
      leadingGap: simple.leadingGap,
      paragraphs: curr,
      gapAfter: new Map(),
    };
    if (text.length <= 40_000) assertRoundTrip(state, gapsOf);
    if (tainted.has(revid)) {
      const prevGaps = gapMap(prev.paragraphs, gapsOf);
      const currGaps = gapMap(curr, gapsOf);
      state.gapAfter = currGaps;
      sourceRevids.push(prev.revid);
      sources.push({ revid: prev.revid, tokens: flatten(prev.paragraphs) });
      captureRefs(
        prev.revid,
        flatten(prev.paragraphs),
        prevGaps,
        tainted,
        tokensById,
        savedRefs,
      );
      const built = buildHunks(
        { ...prev, gapAfter: prevGaps },
        state,
        anchorWindow,
      );
      hunks.push(...built.hunks);
      taintedMoves.push(...built.moves);
    }
    last = state;
    prev = state;
    return true;
  };

  for (const revision of revisions) {
    if (revision.content == null) continue;
    gen++;
    const text = normalizeNewlines(revision.content);
    currentRevid = revision.revid;
    prevGapById = prev ? gapMap(prev.paragraphs, gapsOf) : new Map();
    if (prev && tryPositional(text, revision.revid)) continue;
    const described = paragraphSpans(text);
    const spans = described.spans;
    const splitOf = new Array<SplitParagraph | null>(spans.length).fill(null);
    const splitAt = (index: number): SplitParagraph => {
      const existing = splitOf[index];
      if (existing) return existing;
      const built = materializeParagraph(spans[index]!);
      splitOf[index] = built;
      return built;
    };
    const currObjs: Array<ParagraphObj | null> = spans.map(() => null);
    const prevParas = prev?.paragraphs ?? [];
    const prevObjSet = new Set(prevParas);
    const prevGrouped = groupBy(prevParas, (paragraph) => paragraph.key);
    const currGrouped = groupIndices(spans, (span) => span.key);
    const taken = new Set<number>();

    if (tainted.has(revision.revid)) {
      // Reuse a paragraph only while it stays on the same diagonal. A matching
      // key on a new diagonal is a move, which a tainted edit does not keep.
      const edits = myersDiff(
        prevParas.map((paragraph) => paragraph.key),
        spans.map((span) => span.key),
      );
      let diagonal: number | null = null;
      for (const edit of edits) {
        if (edit.type !== "equal") continue;
        const diag = edit.aStart - edit.bStart;
        if (diagonal === null) diagonal = diag;
        if (diag !== diagonal) continue;
        for (let k = edit.aStart; k < edit.aEnd; k++) {
          const paragraph = prevParas[k]!;
          const index = edit.bStart + (k - edit.aStart);
          claimParagraph(paragraph);
          currObjs[index] = paragraph;
          taken.add(index);
        }
      }
    }

    if (!tainted.has(revision.revid)) {
      for (const [key, indices] of currGrouped) {
        const prevs = prevGrouped.get(key) ?? [];
        if (prevs.length > 0 && prevs.length === indices.length) {
          for (let i = 0; i < indices.length; i++) {
            claimParagraph(prevs[i]!);
            currObjs[indices[i]!] = prevs[i]!;
            taken.add(indices[i]!);
          }
          prevGrouped.set(key, []);
        }
      }

      for (const [key, indices] of currGrouped) {
        const left = indices.filter((index) => !taken.has(index));
        if (left.length === 0) continue;
        const prevs = (prevGrouped.get(key) ?? []).filter(
          (paragraph) => paragraph.claimedGen !== gen,
        );
        if (prevs.length === 0) continue;
        const paragraph = prevs[0]!;
        claimParagraph(paragraph);
        currObjs[left[0]!] = paragraph;
        taken.add(left[0]!);
        prevGrouped.set(key, prevs.slice(1));
      }

      for (const [key, indices] of currGrouped) {
        const hist = paragraphsByKey.get(key) ?? [];
        for (const index of indices) {
          if (taken.has(index)) continue;
          for (const paragraph of hist) {
            if (prevObjSet.has(paragraph) || !paragraphClaimable(paragraph))
              continue;
            claimParagraph(paragraph);
            currObjs[index] = paragraph;
            taken.add(index);
            break;
          }
        }
      }
    }

    interface CurrSent {
      paraIndex: number;
      split: SplitSentence;
      obj: SentenceObj | null;
    }
    const currSents: CurrSent[] = [];
    for (let pi = 0; pi < spans.length; pi++) {
      if (currObjs[pi]) continue;
      for (const sentence of splitAt(pi).sentences) {
        currSents.push({ paraIndex: pi, split: sentence, obj: null });
      }
    }
    const prevSents: SentenceObj[] = [];
    for (const paragraph of prevParas) {
      if (paragraph.claimedGen === gen) continue;
      for (const sentence of paragraph.sentences) {
        if (sentence.claimedGen !== gen) prevSents.push(sentence);
      }
    }
    const prevSentSet = new Set(prevSents);
    const sentGrouped = groupIndices(currSents, (sent) => sent.split.key);
    const prevSentGrouped = groupBy(prevSents, (sentence) => sentence.key);

    if (!tainted.has(revision.revid)) {
      for (const [key, indices] of sentGrouped) {
        const prevs = prevSentGrouped.get(key) ?? [];
        if (prevs.length > 0 && prevs.length === indices.length) {
          for (let i = 0; i < indices.length; i++) {
            claimSentence(prevs[i]!);
            currSents[indices[i]!]!.obj = prevs[i]!;
          }
          prevSentGrouped.set(key, []);
        }
      }
      for (const [key, indices] of sentGrouped) {
        const left = indices.filter((index) => !currSents[index]!.obj);
        if (left.length === 0) continue;
        const prevs = (prevSentGrouped.get(key) ?? []).filter(
          (sentence) => sentence.claimedGen !== gen,
        );
        if (prevs.length === 0) continue;
        const sentence = prevs[0]!;
        claimSentence(sentence);
        currSents[left[0]!]!.obj = sentence;
        prevSentGrouped.set(key, prevs.slice(1));
      }
      for (const [key, indices] of sentGrouped) {
        const hist = sentencesByKey.get(key) ?? [];
        for (const index of indices) {
          if (currSents[index]!.obj) continue;
          for (const sentence of hist) {
            if (prevSentSet.has(sentence) || !sentenceClaimable(sentence))
              continue;
            claimSentence(sentence);
            currSents[index]!.obj = sentence;
            break;
          }
        }
      }
    }

    const unmatchedCurr = currSents.filter((sentence) => !sentence.obj);
    const unmatchedPrev = prevSents.filter(
      (sentence) => sentence.claimedGen !== gen,
    );
    const currPieces = unmatchedCurr.map((sentence) => sentence.split.tokens);
    const placed: Token[][] = currPieces.map(
      (tokens) => new Array<Token>(tokens.length),
    );
    const insertedIds: number[][] = currPieces.map(() => []);
    const removedIds: number[][] = currPieces.map(() => []);
    if (currPieces.length > 0 || unmatchedPrev.length > 0) {
      const currSides: TextToken[][] = currPieces.map((tokens) =>
        tokens.map((token) => ({
          value: token.value,
          gapAfter: token.gapAfter,
        })),
      );
      const alignment = alignSentences(
        unmatchedPrev.map((sentence) =>
          symbolKeys(sentence.tokens.map(textOf)),
        ),
        currSides.map((tokens) => symbolKeys(tokens)),
      );
      for (const pair of alignment.pairs) {
        weave(
          unmatchedPrev[pair.prev]!.tokens,
          currSides[pair.curr]!,
          revision.revid,
          placed[pair.curr]!,
          removedIds[pair.curr]!,
          insertedIds[pair.curr]!,
        );
      }
      for (const index of alignment.inserted) {
        const currTokens = currSides[index]!;
        for (let k = 0; k < currTokens.length; k++) {
          const token = createToken(currTokens[k]!.value, revision.revid);
          placed[index]![k] = token;
          insertedIds[index]!.push(token.id);
        }
      }
      if (!tainted.has(revision.revid)) {
        for (let si = 0; si < placed.length; si++) {
          const removed = removedIds[si]!;
          const inserted = insertedIds[si]!;
          if (removed.length === 0 || inserted.length === 0) continue;
          const hasTainted =
            placed[si]!.some((token) => tainted.has(token.origin)) ||
            removed.length > 0;
          if (!hasTainted) continue;
          paraphrase.push({
            rev: revision.revid,
            insertedIds: inserted,
            removedTaintedIds: removed,
          });
        }
      }
    }

    const sentsByPara = new Map<number, CurrSent[]>();
    for (const sentence of currSents) {
      const list = sentsByPara.get(sentence.paraIndex);
      if (list) list.push(sentence);
      else sentsByPara.set(sentence.paraIndex, [sentence]);
    }
    let unmatchedCursor = 0;
    for (let pi = 0; pi < spans.length; pi++) {
      if (currObjs[pi]) continue;
      const mine = sentsByPara.get(pi) ?? [];
      const sentences: SentenceObj[] = [];
      for (const currSent of mine) {
        if (currSent.obj) {
          sentences.push(currSent.obj);
          continue;
        }
        const tokens = placed[unmatchedCursor] ?? [];
        unmatchedCursor++;
        if (tokens.some((token) => !token)) {
          throw new Error(`unfilled token in revision ${revision.revid}`);
        }
        const sentence: SentenceObj = {
          key: currSent.split.key,
          tokens,
          claimedGen: gen,
        };
        registerSentence(sentence);
        sentences.push(sentence);
      }
      const paragraph: ParagraphObj = {
        key: spans[pi]!.key,
        sentences,
        claimedGen: gen,
      };
      registerParagraph(paragraph);
      currObjs[pi] = paragraph;
    }

    const paragraphs = currObjs.map((paragraph, index) => {
      if (!paragraph)
        throw new Error(
          `unbuilt paragraph ${index} in revision ${revision.revid}`,
        );
      return paragraph;
    });
    const prevRev = prev?.revid;
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const paragraph = paragraphs[pi]!;
      const signature = spans[pi]!.signature;
      regionOf.set(paragraph, {
        text,
        start: spans[pi]!.base,
        end: spans[pi]!.base + spans[pi]!.key.length,
        after: spans[pi]!.after,
      });
      if (paraSignature.get(paragraph) === signature && gapsOf.has(paragraph))
        continue;
      rememberGaps(splitAt(pi), paragraph, gapsOf, revision.revid);
      noteGapEdits([paragraph]);
      paraSignature.set(paragraph, signature);
    }

    if (prev) {
      for (const paragraph of prev.paragraphs) {
        if (paragraph.claimedGen === gen) continue;
        for (const sentence of paragraph.sentences) {
          if (sentence.claimedGen === gen) continue;
          for (const token of sentence.tokens) {
            if (token.claimedGen !== gen)
              token.events.push({ rev: revision.revid, kind: "out" });
          }
        }
      }
    }
    for (const paragraph of paragraphs) {
      if (prevRev !== undefined && paraSeen.get(paragraph) === prevRev) {
        paraSeen.set(paragraph, revision.revid);
        continue;
      }
      const seenTok = new Set<number>();
      for (const sentence of paragraph.sentences) {
        for (const token of sentence.tokens) {
          if (seenTok.has(token.id)) continue;
          seenTok.add(token.id);
          if (
            token.origin !== revision.revid &&
            token.lastSeenRev !== (prevRev ?? token.lastSeenRev)
          ) {
            token.events.push({ rev: revision.revid, kind: "in" });
          }
          token.lastSeenRev = revision.revid;
        }
      }
      paraSeen.set(paragraph, revision.revid);
    }

    const state: RevState = {
      revid: revision.revid,
      text,
      leadingGap: described.leadingGap,
      paragraphs,
      gapAfter: new Map(),
    };
    if (text.length <= 40_000) assertRoundTrip(state, gapsOf);

    if (tainted.has(revision.revid) && prev) {
      const prevGaps = gapMap(prev.paragraphs, gapsOf);
      const currGaps = gapMap(paragraphs, gapsOf);
      const prevView: RevState = { ...prev, gapAfter: prevGaps };
      state.gapAfter = currGaps;
      sourceRevids.push(prev.revid);
      sources.push({ revid: prev.revid, tokens: flatten(prev.paragraphs) });
      captureRefs(
        prev.revid,
        flatten(prev.paragraphs),
        prevGaps,
        tainted,
        tokensById,
        savedRefs,
      );
      const built = buildHunks(prevView, state, anchorWindow);
      hunks.push(...built.hunks);
      taintedMoves.push(...built.moves);
    }
    last = state;
    prev = state;
  }

  if (!last) {
    return {
      finalRevid: null,
      finalText: "",
      finalLeading: "",
      finalTokens: [],
      finalGapAfter: new Map(),
      finalSentences: [],
      hunks,
      taintedMoves,
      paraphrase,
      tokensById,
      sources,
      savedRefs,
      sourceRevids,
    };
  }

  const finalGaps = gapMap(last.paragraphs, gapsOf);
  for (const [id, gap] of restoredGaps) {
    if (finalGaps.has(id)) finalGaps.set(id, gap);
  }
  last.gapAfter = finalGaps;
  captureRefs(
    last.revid,
    flatten(last.paragraphs),
    finalGaps,
    tainted,
    tokensById,
    savedRefs,
  );
  return {
    finalRevid: last.revid,
    finalText: last.text,
    finalLeading: last.leadingGap,
    finalTokens: flatten(last.paragraphs),
    finalGapAfter: finalGaps,
    finalSentences: last.paragraphs.flatMap((paragraph) =>
      paragraph.sentences.map((sentence) => sentence.tokens),
    ),
    hunks,
    taintedMoves,
    paraphrase,
    tokensById,
    sources,
    savedRefs,
    sourceRevids,
  };
}

/** Walk every visible revision and throw if token gaps do not rebuild it. */
export function revisionsRoundTrip(revisions: readonly Revision[]): void {
  analyze(revisions, new Set(), 50);
}

function rememberGaps(
  split: SplitParagraph,
  paragraph: ParagraphObj,
  gapsOf: WeakMap<ParagraphObj, string[]>,
  revid: number,
) {
  const splitTokens = split.sentences.flatMap((sentence) => sentence.tokens);
  const objTokens = paragraph.sentences.flatMap((sentence) => sentence.tokens);
  if (splitTokens.length !== objTokens.length) {
    throw new Error(
      `token lockstep ${splitTokens.length} vs ${objTokens.length} in ${revid} for ${JSON.stringify(split.key).slice(0, 80)}`,
    );
  }
  const gaps: string[] = [];
  for (let i = 0; i < splitTokens.length; i++) {
    const splitToken = splitTokens[i]!;
    const token = objTokens[i]!;
    if (splitToken.value !== token.value) {
      throw new Error(
        `value mismatch "${splitToken.value}" vs "${token.value}" in ${revid}`,
      );
    }
    gaps.push(splitToken.gapAfter);
  }
  gapsOf.set(paragraph, gaps);
}

function gapMap(
  paragraphs: readonly ParagraphObj[],
  gapsOf: WeakMap<ParagraphObj, string[]>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const paragraph of paragraphs) {
    const gaps = gapsOf.get(paragraph) ?? [];
    let index = 0;
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens)
        map.set(token.id, gaps[index++] ?? "");
    }
  }
  return map;
}

function assertRoundTrip(
  state: RevState,
  gapsOf: WeakMap<ParagraphObj, string[]>,
) {
  const parts = [state.leadingGap];
  for (const paragraph of state.paragraphs) {
    const gaps = gapsOf.get(paragraph) ?? [];
    let index = 0;
    for (const sentence of paragraph.sentences) {
      for (const token of sentence.tokens)
        parts.push(token.value, gaps[index++] ?? "");
    }
  }
  const rendered = parts.join("");
  if (rendered !== state.text) {
    throw new Error(
      `round-trip failed for ${state.revid}\n--- rendered ---\n${rendered}\n--- source ---\n${state.text}`,
    );
  }
}

function buildHunks(
  prev: RevState,
  curr: RevState,
  anchorWindow: number,
): { hunks: Hunk[]; moves: number[] } {
  const before = flatten(prev.paragraphs);
  const after = flatten(curr.paragraphs);
  let edits: Edit[];
  if (before.length > MYERS_TOKEN_CAP || after.length > MYERS_TOKEN_CAP) {
    edits = [
      { type: "delete", aStart: 0, aEnd: before.length, bStart: 0, bEnd: 0 },
      {
        type: "insert",
        aStart: before.length,
        aEnd: before.length,
        bStart: 0,
        bEnd: after.length,
      },
    ];
  } else {
    edits = cappedDiff(
      before.map((token) => token.id),
      after.map((token) => token.id),
    );
  }

  const deletedIds = new Set<number>();
  const insertedIds = new Set<number>();
  for (const edit of edits) {
    if (edit.type === "delete") {
      for (let i = edit.aStart; i < edit.aEnd; i++)
        deletedIds.add(before[i]!.id);
    } else if (edit.type === "insert") {
      for (let i = edit.bStart; i < edit.bEnd; i++)
        insertedIds.add(after[i]!.id);
    }
  }
  const moves = new Set<number>();
  for (const id of deletedIds) if (insertedIds.has(id)) moves.add(id);

  const indexInPrev = new Map<number, number>();
  before.forEach((token, index) => indexInPrev.set(token.id, index));

  const hunks: Hunk[] = [];
  let cursor = 0;
  while (cursor < edits.length) {
    if (edits[cursor]!.type === "equal") {
      cursor++;
      continue;
    }
    const deleted: Token[] = [];
    const inserted: Token[] = [];
    let rangeStart = Infinity;
    let rangeEnd = -1;
    while (cursor < edits.length && edits[cursor]!.type !== "equal") {
      const edit = edits[cursor]!;
      if (edit.type === "delete") {
        rangeStart = Math.min(rangeStart, edit.aStart);
        rangeEnd = Math.max(rangeEnd, edit.aEnd);
        for (let i = edit.aStart; i < edit.aEnd; i++) {
          const token = before[i]!;
          if (!moves.has(token.id)) deleted.push(token);
        }
      } else {
        if (rangeStart === Infinity) rangeStart = edit.aStart;
        rangeEnd = Math.max(rangeEnd, edit.aStart);
        for (let i = edit.bStart; i < edit.bEnd; i++) {
          const token = after[i]!;
          if (!moves.has(token.id)) inserted.push(token);
        }
      }
      cursor++;
    }
    if (deleted.length === 0 && inserted.length === 0) continue;
    if (rangeStart === Infinity) rangeStart = 0;
    if (rangeEnd < 0) rangeEnd = rangeStart;

    const deletedGapAfter = deleted.map(
      (token) => prev.gapAfter.get(token.id) ?? "",
    );
    let deletedText = "";
    for (let i = 0; i < deleted.length; i++) {
      if (i > 0) {
        const left = indexInPrev.get(deleted[i - 1]!.id)!;
        const right = indexInPrev.get(deleted[i]!.id)!;
        deletedText +=
          right === left + 1
            ? (prev.gapAfter.get(deleted[i - 1]!.id) ?? "")
            : (prev.gapAfter.get(deleted[i - 1]!.id) ?? " ");
      }
      deletedText += deleted[i]!.value;
    }
    const leftAnchorIds: number[] = [];
    for (
      let i = rangeStart - 1;
      i >= 0 && leftAnchorIds.length < anchorWindow;
      i--
    ) {
      leftAnchorIds.push(before[i]!.id);
    }
    const rightAnchorIds: number[] = [];
    for (
      let i = rangeEnd;
      i < before.length && rightAnchorIds.length < anchorWindow;
      i++
    ) {
      rightAnchorIds.push(before[i]!.id);
    }
    const gapBefore =
      rangeStart <= 0
        ? prev.leadingGap
        : (prev.gapAfter.get(before[rangeStart - 1]!.id) ?? "");
    hunks.push({
      rev: curr.revid,
      deleted,
      deletedGapAfter,
      gapBefore,
      deletedText,
      inserted,
      leftAnchorIds,
      rightAnchorIds,
    });
  }
  return { hunks, moves: [...moves] };
}

function captureRefs(
  revid: number,
  tokens: Token[],
  gaps: Map<number, string>,
  tainted: ReadonlySet<number>,
  tokensById: Map<number, Token>,
  into: SavedRef[],
) {
  const scan = scanTokens(
    tokens.map((token) => ({
      id: token.id,
      text: token.value,
      gapAfter: gaps.get(token.id) ?? "",
    })),
  );
  for (const ref of scan.refs) {
    if (ref.kind !== "def" || !ref.name) continue;
    const opener = tokensById.get(ref.openerId);
    if (!opener) continue;
    const contentTainted =
      tainted.has(opener.origin) ||
      ref.contentTokenIds.some((id) => {
        const token = tokensById.get(id);
        return token ? tainted.has(token.origin) : false;
      });
    into.push({
      name: ref.name,
      revid,
      openerOrigin: opener.origin,
      contentTainted,
      listDefined: ref.listDefined,
      tokens: ref.tokenIds.flatMap((id) => {
        const token = tokensById.get(id);
        if (!token) return [];
        return [
          {
            id,
            text: token.value,
            gapAfter: gaps.get(id) ?? "",
            origin: token.origin,
          },
        ];
      }),
    });
  }
}

function sameChars(
  a: string,
  a0: number,
  a1: number,
  b: string,
  b0: number,
  b1: number,
): boolean {
  const length = a1 - a0;
  if (length !== b1 - b0) return false;
  for (let i = 0; i < length; i++) {
    if (a.charCodeAt(a0 + i) !== b.charCodeAt(b0 + i)) return false;
  }
  return true;
}

function cappedDiff<T>(before: readonly T[], after: readonly T[]): Edit[] {
  if (before.length > MYERS_TOKEN_CAP || after.length > MYERS_TOKEN_CAP) {
    return [
      { type: "delete", aStart: 0, aEnd: before.length, bStart: 0, bEnd: 0 },
      {
        type: "insert",
        aStart: before.length,
        aEnd: before.length,
        bStart: 0,
        bEnd: after.length,
      },
    ];
  }
  return myersDiff(before, after);
}

function flatten(paragraphs: readonly ParagraphObj[]): Token[] {
  const out: Token[] = [];
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) out.push(...sentence.tokens);
  }
  return out;
}

function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = out.get(key);
    if (list) list.push(item);
    else out.set(key, [item]);
  }
  return out;
}

function groupIndices<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const list = out.get(key);
    if (list) list.push(index);
    else out.set(key, [index]);
  });
  return out;
}
