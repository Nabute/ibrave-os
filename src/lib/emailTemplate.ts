/** Frontend twin of the Edge helper: substitute {{placeholders}}. Unknown
 *  keys stay visible ({{x}}) so the writer notices an unfilled slot. */
export function fillTemplate(tpl: string, vars: Record<string, string | undefined>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k) => vars[k] ?? m);
}
