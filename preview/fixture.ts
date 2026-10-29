import type { Explanation } from "../scrubber/types.ts";
import type { ReviewState } from "../userscript/review/state.ts";

const latestText = [
  "Intro paragraph that stays.",
  "[[Category:Actors]]",
  "[[Category:Comedians]]",
  "[[Category:Alumni]]",
  "A sentence that stays.",
].join("\n");

const proposal = [
  "Intro paragraph that stays.",
  "Restored sentence from an older revision.",
  "A sentence that stays.",
].join("\n");

const explanations: Explanation[] = [
  {
    action: "remove-tainted",
    start: [1, 0],
    end: [1, 0],
    latestStart: [1, 0],
    latestEnd: [4, 0],
    details: ["rev:10", "chars:70"],
  },
  {
    action: "markup-repair",
    start: [1, 0],
    end: [1, 0],
    latestStart: [1, 0],
    latestEnd: [4, 0],
    details: ["table"],
  },
  {
    action: "remove-tainted",
    start: [1, 0],
    end: [1, 0],
    latestStart: [1, 0],
    latestEnd: [2, 0],
    details: ["rev:11", "chars:20"],
  },
  {
    action: "restore",
    start: [1, 0],
    end: [1, 20],
    details: ["rev:3", "origin:1"],
  },
];

export function fixtureState(): ReviewState {
  return {
    title: "Example",
    latestText,
    latestRevid: 20,
    baseRevid: 20,
    proposal,
    explanations,
    taintedRevids: [10, 11],
    status: "processed",
    origin: "https://en.wikipedia.org",
    rows: null,
    warnings: [],
    statusText: "",
    editing: false,
    draft: proposal,
    done: false,
    failed: "",
    rowActions: false,
  };
}
