import { assemble } from "./assemble";
import { passDerivative } from "./pass-derivative";
import { passMarkup } from "./pass-markup";
import { passRefs } from "./pass-refs";
import { passSections } from "./pass-sections";
import { passWhitespace } from "./pass-whitespace";
import { applyRestoredSections } from "./post-restore";
import { analyze } from "./provenance";
import { renderStream, renderText, sortExplanations } from "./render";
import { isPresent, revertRevids, trivialRollback } from "./replay";
import { describeSections, type SectionSpan } from "./sections";
import { mapStrippedLine, stripNakedTables } from "./tables";
import { normalizeNewlines } from "./split";
import {
  resolveOptions,
  type Explanation,
  type Note,
  type OnRestoredSection,
  type Options,
  type Revision,
} from "./types";

export type {
  Explanation,
  OnRestoredSection,
  Options,
  Pos,
  RestoredSectionInput,
  Revision,
  SectionComment,
} from "./types";

const DOC_START = new Set([
  "warn-unknown-revid",
  "warn-tainted-hidden",
  "kept-tainted-revert",
  "all-tainted",
]);

interface ScrubResult {
  content: string;
  explanations: Explanation[];
}

export function cleanTaintedHistory(
  revisions: Revision[],
  taintedRevids: number[],
  options: Options & { onRestoredSection: OnRestoredSection },
): Promise<ScrubResult>;
export function cleanTaintedHistory(
  revisions: Revision[],
  taintedRevids: number[],
  options?: Options,
): ScrubResult;
export function cleanTaintedHistory(
  revisions: Revision[],
  taintedRevids: number[],
  options?: Options,
): ScrubResult | Promise<ScrubResult> {
  const opts = resolveOptions(options);
  const known = new Set(revisions.map((revision) => revision.revid));
  const unknown = [
    ...new Set(taintedRevids.filter((id) => !known.has(id))),
  ].sort((a, b) => a - b);
  const tainted = new Set(taintedRevids.filter((id) => known.has(id)));
  const warnings: Note[] = [];
  if (unknown.length > 0) {
    warnings.push({
      action: "warn-unknown-revid",
      details: unknown.map((id) => `rev:${id}`),
      start: 0,
      end: 0,
    });
  }
  for (const revision of revisions) {
    if (revision.content == null && tainted.has(revision.revid)) {
      warnings.push({
        action: "warn-tainted-hidden",
        details: [`rev:${revision.revid}`],
        start: 0,
        end: 0,
      });
    }
  }

  const last = [...revisions]
    .reverse()
    .find((revision) => revision.content != null);
  const taintedVisible = revisions.some(
    (revision) => revision.content != null && tainted.has(revision.revid),
  );
  if (!taintedVisible) {
    return finish(options, {
      content: last?.content ?? "",
      explanations: sortExplanations(
        warnings.map((note) => ({
          start: [0, 0],
          end: [0, 0],
          action: note.action,
          details: note.details,
        })),
      ),
    });
  }

  const reverts = revertRevids(revisions);
  const rollback = trivialRollback(revisions, tainted, reverts);
  if (rollback) {
    const explanations: Explanation[] = [];
    if (rollback.emptied) {
      explanations.push({ action: "all-tainted", start: [0, 0], end: [0, 0] });
    } else {
      for (const id of rollback.undone) {
        const revision = revisions.find((item) => item.revid === id);
        explanations.push({
          action: "remove-tainted",
          start: [0, 0],
          end: [0, 0],
          details: [`rev:${id}`, `chars:${revision?.content?.length ?? 0}`],
        });
      }
    }
    if (rollback.keptRevert != null) {
      explanations.push({
        action: "kept-tainted-revert",
        start: [0, 0],
        end: [0, 0],
        details: [`rev:${rollback.keptRevert}`],
      });
    }
    explanations.push(
      ...warnings.map((note) => ({
        start: [0, 0] as [number, number],
        end: [0, 0] as [number, number],
        action: note.action,
        details: note.details,
      })),
    );
    return finish(options, {
      content: rollback.content,
      explanations: sortExplanations(explanations),
    });
  }

  const analysis = analyze(revisions, tainted, opts.restoreAnchorWindow);
  const assembled = assemble(analysis, tainted, reverts);
  let leading = assembled.leadingGap;
  let items = assembled.items;
  let notes = assembled.notes;
  let nextId = assembled.nextUid;
  const nextUid = () => nextId++;
  const droppedFinalIds = new Set(
    analysis.finalTokens
      .filter((token) => !isPresent(token, tainted, reverts))
      .map((token) => token.id),
  );

  const derived = passDerivative(items, notes, {
    tainted,
    options: opts,
    finalSentences: analysis.finalSentences,
    droppedFinalIds,
    paraphrase: analysis.paraphrase,
    leading,
  });
  leading = derived.leading;
  items = derived.items;
  notes = derived.notes;

  const marked = passMarkup(items, notes, analysis);
  items = marked.items;
  notes = marked.notes;

  const refs = passRefs(items, notes, analysis, opts, tainted, nextUid);
  items = refs.items;
  notes = refs.notes;

  const sections = passSections(items, notes, tainted);
  items = sections.items;
  notes = sections.notes;

  const finalNorm = normalizeNewlines(analysis.finalText);
  if (renderText(leading, items) !== finalNorm) {
    const spaced = passWhitespace(
      leading,
      items,
      notes,
      finalNorm,
      droppedFinalIds,
      analysis.finalTokens,
    );
    leading = spaced.leading;
    items = spaced.items;
    notes = spaced.notes;
  }

  for (const id of [...tainted].sort((a, b) => a - b)) {
    if (reverts.has(id))
      notes.push({
        action: "kept-tainted-revert",
        details: [`rev:${id}`],
        start: 0,
        end: 0,
      });
  }
  notes.push(...warnings);
  if (items.length === 0 && analysis.finalTokens.length > 0) {
    notes.push({ action: "all-tainted", start: 0, end: 0 });
    leading = "";
  }

  const rendered = renderStream(leading, items, notes);
  for (const explanation of rendered.explanations) {
    if (DOC_START.has(explanation.action)) {
      explanation.start = [0, 0];
      explanation.end = [0, 0];
    }
  }
  const content = items.length === 0 ? "" : rendered.content;
  const timestamps = new Map<number, string>();
  for (const revision of revisions) {
    if (revision.timestamp) timestamps.set(revision.revid, revision.timestamp);
  }
  const stripped = stripNakedTables(content);
  const explanations = sortExplanations(rendered.explanations);
  if (stripped.removed) {
    for (const explanation of explanations) {
      const start = mapStrippedLine(explanation.start[0], stripped.lineMap);
      const end = mapStrippedLine(explanation.end[0], stripped.lineMap);
      if (start == null && end == null) {
        explanation.start = [0, 0];
        explanation.end = [0, 0];
        continue;
      }
      explanation.start = [
        start ?? end ?? 0,
        start == null ? 0 : explanation.start[1],
      ];
      explanation.end = [
        end ?? start ?? 0,
        end == null ? 0 : explanation.end[1],
      ];
    }
    explanations.push({
      action: "remove-naked-table",
      start: [0, 0],
      end: [0, 0],
      details: ["Dropped table rows left outside a table"],
    });
  }
  const nextContent = stripped.removed ? stripped.content : content;
  const spans =
    !stripped.removed && content === rendered.content
      ? describeSections(content, leading, items, timestamps)
      : [];
  return finish(
    options,
    {
      content: nextContent,
      explanations: sortExplanations(explanations),
    },
    spans,
  );
}

function finish(
  options: Options | undefined,
  result: ScrubResult,
  spans: readonly SectionSpan[] = [],
): ScrubResult | Promise<ScrubResult> {
  if (!options?.onRestoredSection) return result;
  return applyRestoredSections(
    result.content,
    result.explanations,
    spans,
    options.onRestoredSection,
  );
}
