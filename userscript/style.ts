export const PAGE_CSS = `
.emf-filters { background: rgba(160, 32, 240, 0.15); }
.emf-manual { background: rgba(255, 214, 0, 0.38); }
.emf-excluded { background: rgba(214, 54, 54, 0.18); }
.emf-status { float: right; margin-left: 0.6em; }
.emf-status-processing { color: #4682b4; }
.emf-status-processed { color: #31628f; }
.emf-status-flagged, .emf-status-review { color: #ff4500; font-weight: bold; }
.emf-status-applied, .emf-status-prod.emf-status-applied { color: #228b22; }
.emf-status-prod { color: #6f42c1; font-weight: bold; }
.emf-status-skipped { color: #72777d; }
.emf-status-undone { color: #ff4500; }
.emf-namespaces div, .emf-creations > div { display: inline-block; margin-right: 0.75em; }
.emf-queue-stats { white-space: pre-line; line-height: 1.45; }
.emf-error { color: #ff4500; font-weight: bold; }
body.emf-focus .mw-contributions-list input[type="checkbox"],
body.emf-focus .emf-tick { visibility: hidden; }
body.emf-focus li[data-mw-revid]:not(.emf-selected),
body.emf-focus .mw-contributions-no-revision { display: none; }
html.emf-dragging, html.emf-dragging * { user-select: none; }
.morebits-dialog-titlebar { user-select: none; }
`;

export function injectPageStyles(): void {
  if (document.getElementById("emf-styles")) return;
  const style = document.createElement("style");
  style.id = "emf-styles";
  style.textContent = PAGE_CSS;
  document.head.append(style);
  if (!document.getElementById("emf-morebits-css")) {
    const link = document.createElement("link");
    link.id = "emf-morebits-css";
    link.rel = "stylesheet";
    link.href =
      "https://meta.wikimedia.org/w/index.php?title=MediaWiki:Gadget-morebits.css&action=raw&ctype=text/css";
    document.head.append(link);
  }
}
