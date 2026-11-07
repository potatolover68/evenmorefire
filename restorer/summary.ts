const RESTORER = "[[User:MSK/restorer|restorer]]";

export function restoreSummary(
  revid: number,
  user: string | null,
  extra: string,
): string {
  const author = user ? `[[User:${user}|${user}]]` : "a hidden user";
  const base = `${RESTORER}: restored revision [[Special:PermanentLink/${revid}|${revid}]] by ${author}`;
  const tail = extra.trim();
  return tail ? `${base}. ${tail}` : base;
}

export function trackingSummary(title: string): string {
  return `${RESTORER}: marked [[${title}]] completed`;
}
