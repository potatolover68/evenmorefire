import type { CleanupReason } from "./types.ts";

export function editSummary(reason: CleanupReason, extra: string): string {
  const tail = extra.trim();
  if (reason === "AI") {
    return `[[User:MSK/emf|emf!]]: [[WP:LLMPRV|presumptive removal of AI-generated content]]. ${tail}`;
  }
  if (reason === "CV") {
    return `[[User:MSK/emf|emf!]]: removing suspected copyright violations. ${tail}`;
  }
  return `[[User:MSK/emf|emf!]]: ${tail}`;
}

export function prodReason(extra: string): string {
  return `[[WP:LLMPRV|presumptive removal of AI-generated content]]. ${extra.trim()}`;
}

export function prodTemplate(extra: string): string {
  return `{{subst:Prod llm|reason=${escapeTemplate(prodReason(extra))}}}`;
}

function escapeTemplate(value: string): string {
  // Escape }} first. Doing it after the pipe replacement splits {{!}} into {{!} }.
  return value.replaceAll("}}", "} }").replaceAll("|", "{{!}}");
}
