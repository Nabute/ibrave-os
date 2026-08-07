// Branded, email-client-safe HTML template used by every outgoing email —
// user-composed mail, notification digests and dunning letters. Everything is
// inline-styled tables (the only thing that renders consistently across
// Outlook/Gmail/Apple Mail); no external fonts, images or CSS.

const PAPER = "#f4f1ec";
const CARD = "#fdfcfa";
const INK = "#211d18";
const MUTED = "#6f695f";
const HAIRLINE = "#e2ddd3";
const BRASS = "#b0762a";
const CHARCOAL = "#241f1b";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailTemplateOpts {
  /** Hidden inbox-preview line (shows next to the subject in most clients). */
  preheader?: string;
  /** Optional headline inside the card, above the body. */
  heading?: string;
  /** The message content — already-safe HTML fragments. */
  bodyHtml: string;
  /** Optional brass button under the body. */
  cta?: { label: string; url: string };
  /** Small print under the card (e.g. "manage email in Preferences"). */
  footerNote?: string;
  /** Company line in the footer; defaults to the wordmark alone. */
  companyLine?: string;
}

export function renderEmail(opts: EmailTemplateOpts): string {
  const { preheader, heading, bodyHtml, cta, footerNote, companyLine } = opts;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
           style="width:600px;max-width:100%;border-collapse:collapse;">
      <!-- header -->
      <tr>
        <td style="background:${CHARCOAL};border-radius:8px 8px 0 0;padding:18px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:Georgia,'Times New Roman',serif;font-size:20px;
                       letter-spacing:-0.01em;color:#f5f1e8;">ibrave&nbsp;<span style="color:${BRASS};">OS</span></td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="height:3px;background:${BRASS};font-size:0;line-height:0;">&nbsp;</td></tr>
      <!-- card -->
      <tr>
        <td style="background:${CARD};border:1px solid ${HAIRLINE};border-top:0;
                   border-radius:0 0 8px 8px;padding:28px;">
          ${
            heading
              ? `<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-weight:500;font-size:22px;line-height:1.25;color:${INK};">${esc(heading)}</h1>`
              : ""
          }
          <div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">
            ${bodyHtml}
          </div>
          ${
            cta
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>
                   <td style="background:${CHARCOAL};border-radius:6px;">
                     <a href="${cta.url}" style="display:inline-block;padding:11px 22px;
                        font-family:${FONT};font-size:14px;font-weight:600;
                        color:#f5f1e8;text-decoration:none;">${esc(cta.label)}</a>
                   </td></tr></table>`
              : ""
          }
        </td>
      </tr>
      <!-- footer -->
      <tr>
        <td style="padding:18px 28px;font-family:${FONT};font-size:12px;
                   line-height:1.6;color:${MUTED};">
          ${companyLine ? esc(companyLine) : "ibrave — one system, from first hello to final invoice"}
          ${footerNote ? `<br/>${esc(footerNote)}` : ""}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A hairline data block (label/value rows) for invoice + event details. */
export function detailTable(rows: [string, string][]): string {
  const tr = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:7px 16px 7px 0;font-family:${FONT};font-size:12px;
                   text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};
                   white-space:nowrap;vertical-align:top;">${esc(label)}</td>
        <td style="padding:7px 0;font-family:${FONT};font-size:14px;color:${INK};
                   font-weight:600;">${esc(value)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0"
    style="margin:16px 0;border-top:1px solid ${HAIRLINE};border-bottom:1px solid ${HAIRLINE};
           border-collapse:collapse;width:100%;">${tr}</table>`;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Substitute {{placeholders}}; unknown keys collapse to empty string. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => vars[k] ?? "");
}

/** Plain text (blank-line paragraphs) → escaped HTML paragraphs. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
