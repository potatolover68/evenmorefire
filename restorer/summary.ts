const RESTORER = "[[User:MSK/restorer|restorer]]";

export function restoreSummary(
  revid: number,
  user: string | null,
  extra: string,
): string {
  const author = user ? ` by [[Special:Contributions/${user}|${user}]]` : "";
  const base = `${RESTORER}: restored revision [[Special:PermanentLink/${revid}|${revid}]]${author}`;
  const tail = extra.trim();
  return tail ? `${base}. ${tail}` : base;
}

export function trackingSummary(title: string): string {
  return `${RESTORER}: marked [[${title}]] completed`;
}
