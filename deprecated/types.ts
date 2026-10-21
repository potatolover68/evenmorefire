export interface SnippetComment {
  startLine: number;
  startCh: number;
  endLine: number;
  endCh: number;
  text: string;
}

export interface TemplateRevision {
  revid: number;
  timestamp: string;
  content: string;
}
