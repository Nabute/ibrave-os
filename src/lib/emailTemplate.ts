/** Frontend twin of the Edge helper: substitute {{placeholders}}. Unknown
 *  keys stay visible ({{x}}) so the writer notices an unfilled slot. */
export function fillTemplate(tpl: string, vars: Record<string, string | undefined>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => vars[k] ?? m);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
