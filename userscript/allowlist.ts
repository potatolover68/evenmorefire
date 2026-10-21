const ALLOWLIST =
  "https://en.wikipedia.org/w/api.php?action=query&prop=revisions&titles=User:MSK/emf/allowlist.json&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*";

export function parseAllowlist(value: unknown): string[] {
  const list = Array.isArray(value) ? value : arrayField(value);
  return list.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

export function isAllowlisted(
  username: string,
  names: readonly string[],
): boolean {
  if (names[0]?.trim() === "*") return true;
  const wanted = normalizeUser(username);
  if (!wanted) return false;
  return names.some((name) => normalizeUser(name) === wanted);
}

export async function fetchAllowlist(): Promise<string[]> {
  try {
    const response = await fetch(ALLOWLIST);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      query?: {
        pages?: Array<{
          revisions?: Array<{ slots?: { main?: { content?: string } } }>;
        }>;
      };
    };
    const content =
      data.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
    if (typeof content !== "string") return [];
    return parseAllowlist(JSON.parse(content) as unknown);
  } catch {
    return [];
  }
}

function arrayField(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["users", "allow", "allowlist", "names"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

function normalizeUser(name: string): string {
  return name.trim().replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
}
