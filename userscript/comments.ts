import type { Action } from "../scrubber/types.ts";

export const ACTION_LABELS: Record<Action | "deprecated-param", string> = {
  "remove-tainted": "Removed text introduced by a tainted revision",
  restore: "Restored text removed by a tainted revision",
  superseded: "Left a later replacement in place",
  "anchor-lost": "Could not restore text; the surrounding words are gone",
  "kept-tainted-revert": "Kept a tainted revert",
  "drop-derivative": "Removed a later edit that mostly repeated tainted text",
  "flag-derivative": "Flagged a later edit that overlaps tainted text",
  "flag-paraphrase": "Flagged a close paraphrase of tainted text",
  "markup-repair": "Repaired wikitext broken by a removal",
  "flag-unbalanced": "Flagged unbalanced markup",
  deorphan: "Repaired a reference orphaned by a removal",
  "remove-orphan-ref": "Removed a reference left without a citation",
  "remove-unused-ref": "Removed an unused reference definition",
  "remove-empty-section": "Removed an empty section",
  "flag-empty-section":
    "Flagged an empty section that still has a clean heading",
  "flag-fragment": "Flagged a fragment left behind",
  "all-tainted": "The whole page is tainted",
  "warn-unknown-revid": "A requested revision was not in the history",
  "warn-tainted-hidden": "A tainted revision is hidden and was skipped",
  "deprecated-param": "Updated a zombie template parameter",
};

const EXTRA_LABELS: Record<string, string> = {
  "llm-prod": "Tagged a page creation for presumptive deletion",
  "ai-tag": "Tagged a page creation as AI-generated",
  "remove-naked-table": "Removed table rows that were no longer inside a table",
};

export function actionLabel(
  action: string,
  details?: readonly string[],
): string {
  return actionPieces(action, details)
    .map((piece) => piece.text)
    .join("");
}

export interface LabelPiece {
  text: string;
  href?: string;
}

export function actionPieces(
  action: string,
  details?: readonly string[],
  origin = "https://en.wikipedia.org",
): LabelPiece[] {
  if (!details || details.length === 0) {
    return [
      {
        text: ACTION_LABELS[action as Action] ?? EXTRA_LABELS[action] ?? action,
      },
    ];
  }
  const fields = readDetails(details);
  const rev = (id: string): LabelPiece => ({
    text: id,
    href: `${origin}/w/index.php?oldid=${id}`,
  });
  const revs = (ids: readonly string[], singular: string): LabelPiece[] => {
    if (ids.length === 0) return [{ text: singular }];
    const parts: LabelPiece[] = [
      { text: ids.length === 1 ? singular : `${singular}s` },
      { text: " " },
    ];
    ids.forEach((id, index) => {
      if (index > 0)
        parts.push({ text: index === ids.length - 1 ? " and " : ", " });
      parts.push(rev(id));
    });
    return parts;
  };
  switch (action) {
    case "remove-tainted":
      return [
        { text: "Removed text introduced by tainted " },
        ...revs(fields.revs, "revision"),
        ...(fields.chars ? [{ text: ` (${fields.chars} characters)` }] : []),
      ];
    case "restore":
      return [
        { text: "Restored text from " },
        ...revs(fields.origins, "revision"),
        { text: " which was removed by tainted " },
        ...revs(fields.revs, "revision"),
      ];
    case "anchor-lost":
      return [
        { text: "Could not restore text removed by tainted " },
        ...revs(fields.revs, "revision"),
        { text: "; the surrounding words are gone" },
        ...(fields.text ? [{ text: ` ("${fields.text}")` }] : []),
      ];
    case "kept-tainted-revert":
      return [
        { text: "Kept tainted " },
        ...revs(fields.revs, "revision"),
        { text: " because it reverted vandalism" },
      ];
    case "drop-derivative":
      return [
        { text: "Removed a later edit" },
        ...(fields.ratio ? [{ text: ` (${fields.ratio} overlap)` }] : []),
        { text: " that mostly repeated tainted " },
        ...revs(fields.revs, "revision"),
      ];
    case "flag-derivative":
      return [
        { text: "Flagged a later edit that overlaps tainted text" },
        ...(fields.ratio ? [{ text: ` (${fields.ratio} overlap)` }] : []),
      ];
    case "markup-repair":
      return fields.revs.length > 0
        ? [
            { text: "Repaired wikitext broken by removing " },
            ...revs(fields.revs, "revision"),
          ]
        : [{ text: "Repaired a table whose opening or closing was removed" }];
    case "deorphan":
      return [
        { text: `Repaired reference ${quote(fields.name)} orphaned by ` },
        ...revs(fields.revs, "revision"),
      ];
    case "remove-orphan-ref":
      return [
        {
          text: `Removed reference ${quote(fields.name)} left without a citation`,
        },
      ];
    case "remove-unused-ref":
      return [{ text: `Removed unused reference ${quote(fields.name)}` }];
    case "remove-empty-section":
      return [{ text: `Removed the empty section ${quote(fields.heading)}` }];
    case "flag-empty-section":
      return [
        {
          text: `Flagged the empty section ${quote(fields.heading)} that still has a clean heading`,
        },
      ];
    case "warn-unknown-revid":
      return fields.revs.length > 0
        ? [
            { text: "A requested " },
            ...revs(fields.revs, "revision"),
            { text: " was not in the history" },
          ]
        : [
            {
              text:
                fields.other[0] ??
                "A requested revision was not in the history",
            },
          ];
    case "warn-tainted-hidden":
      return [
        { text: "Tainted " },
        ...revs(fields.revs, "revision"),
        {
          text:
            fields.revs.length === 1
              ? " is hidden and was skipped"
              : " are hidden and were skipped",
        },
      ];
    case "deprecated-param":
      return zombiePieces(fields.zombie, origin);
    case "llm-prod":
      return [
        {
          text: `Tagged a page creation for presumptive deletion${fields.other[0] ? ` (${fields.other[0]})` : ""}`,
        },
      ];
    case "ai-tag":
      return [
        {
          text: `Tagged a page creation as AI-generated${fields.other[0] ? ` (${fields.other[0]})` : ""}`,
        },
      ];
    default:
      return [
        {
          text:
            ACTION_LABELS[action as Action] ?? EXTRA_LABELS[action] ?? action,
        },
      ];
  }
}

function zombiePieces(zombie: ZombieNote | null, origin: string): LabelPiece[] {
  if (!zombie) return [{ text: ACTION_LABELS["deprecated-param"] }];
  const changes = zombie.changes
    .map(([from, to]) => (to === "" ? `${from} → removed` : `${from} → ${to}`))
    .join(", ");
  const template = zombie.template ? `{{${zombie.template}}} ` : "";
  return [
    { text: `Updated zombie parameters of ${template}(${changes}) from ` },
    {
      text: zombie.timestamp,
      href: `${origin}/w/index.php?oldid=${zombie.revid}`,
    },
    { text: " using revision " },
    { text: zombie.revid, href: `${origin}/w/index.php?oldid=${zombie.revid}` },
  ];
}

interface ZombieNote {
  template: string | null;
  revid: string;
  timestamp: string;
  changes: Array<[string, string]>;
}

function readDetails(details: readonly string[] | undefined): {
  revs: string[];
  origins: string[];
  heading: string;
  name: string;
  ratio: string;
  chars: string;
  text: string;
  other: string[];
  zombie: ZombieNote | null;
} {
  const revs: string[] = [];
  const origins: string[] = [];
  let heading = "";
  let name = "";
  let ratio = "";
  let chars = "";
  let text = "";
  const other: string[] = [];
  let zombie: ZombieNote | null = null;
  for (const detail of details ?? []) {
    const parsed = parseZombie(detail);
    if (parsed) {
      zombie = parsed;
      continue;
    }
    const rev = /^rev:(\d+)$/.exec(detail);
    if (rev?.[1]) {
      revs.push(rev[1]);
      continue;
    }
    const origin = /^origin:(\d+)$/.exec(detail);
    if (origin?.[1]) {
      origins.push(origin[1]);
      continue;
    }
    const many = /^revs:([\d,]+)$/.exec(detail);
    if (many?.[1]) {
      revs.push(...many[1].split(",").filter(Boolean));
      continue;
    }
    const headingMatch = /^heading:([\s\S]*)$/.exec(detail);
    if (headingMatch?.[1]) {
      heading = headingMatch[1];
      continue;
    }
    const nameMatch = /^name:([\s\S]*)$/.exec(detail);
    if (nameMatch?.[1]) {
      name = nameMatch[1];
      continue;
    }
    const ratioMatch = /^ratio:([\s\S]*)$/.exec(detail);
    if (ratioMatch?.[1]) {
      ratio = ratioMatch[1];
      continue;
    }
    const charsMatch = /^chars:(\d+)$/.exec(detail);
    if (charsMatch?.[1]) {
      chars = charsMatch[1];
      continue;
    }
    const textMatch = /^text:([\s\S]*)$/.exec(detail);
    if (textMatch?.[1]) {
      text = textMatch[1];
      continue;
    }
    other.push(detail);
  }
  return { revs, origins, heading, name, ratio, chars, text, other, zombie };
}

function parseZombie(detail: string): ZombieNote | null {
  const match =
    /^revid:(\d+)\s+timestamp:(\S+)\s+template:("(?:\\.|[^"\\])*")\s+(\[[\s\S]*\])$/.exec(
      detail.trim(),
    );
  if (!match) return null;
  let template: string | null = null;
  try {
    const parsed = JSON.parse(match[3] ?? "null") as unknown;
    template = typeof parsed === "string" ? parsed : null;
  } catch {
    template = null;
  }
  let changes: Array<[string, string]> = [];
  try {
    const parsed = JSON.parse(match[4] ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      changes = parsed.filter(
        (item): item is [string, string] =>
          Array.isArray(item) &&
          item.length >= 2 &&
          typeof item[0] === "string" &&
          typeof item[1] === "string",
      );
    }
  } catch {
    changes = [];
  }
  return {
    template,
    revid: match[1] ?? "",
    timestamp: match[2] ?? "",
    changes,
  };
}

function quote(value: string): string {
  return value ? `"${value}"` : "an unnamed item";
}
