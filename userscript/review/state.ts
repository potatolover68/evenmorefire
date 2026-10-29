import type { Explanation } from "../../scrubber/types.ts";
import type { AlignedRow } from "../align.ts";
import type { JobStatus } from "../types.ts";

export interface ReviewActions {
  apply: (content: string) => Promise<void>;
  reject: () => Promise<void>;
  undo: () => Promise<void>;
  rejectUnnecessary: () => Promise<void>;
  rejectTagged: () => Promise<void>;
}

export interface ReviewState {
  title: string;
  latestText: string;
  latestRevid: number;
  baseRevid: number | null;
  proposal: string;
  explanations: Explanation[];
  taintedRevids: number[];
  status: JobStatus;
  origin: string;
  rows: readonly AlignedRow[] | null;
  warnings: string[];
  statusText: string;
  editing: boolean;
  draft: string;
  done: boolean;
  failed: string;
  rowActions: boolean;
}
