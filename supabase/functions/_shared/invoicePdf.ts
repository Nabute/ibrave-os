// Server-side invoice PDF (Phase 10): generated in the Edge Function with
// pdf-lib so the client never needs a print dialog for emailed invoices.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface InvoicePdfData {
  number: string;
  kind: string;
  issued_at: string | null;
  due_date: string | null;
  currency: string;
  subtotal_minor: number;
  tax_total_minor: number;
  total_minor: number;
  clients: { name: string; billing_address: string | null } | null;
  invoice_lines: {
    description: string;
    quantity: number;
    unit_price_minor: number;
    amount_minor: number;
    position: number;
  }[];
}

export interface CompanyBlock {
  company_name: string;
  legal_name: string | null;
  address: string | null;
  bank_details: string | null;
}

const ink = rgb(0.08, 0.13, 0.16);
const teal = rgb(0.11, 0.36, 0.33);
const gray = rgb(0.45, 0.48, 0.5);

export async function buildInvoicePdf(
  inv: InvoicePdfData,
  company: CompanyBlock
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const money = (minor: number) =>
    `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${inv.currency}`;

  let y = 790;
  const left = 50;
  const right = 545;

  page.drawText(company.company_name, { x: left, y, size: 20, font: bold, color: teal });
  const title = inv.kind === "credit_note" ? "CREDIT NOTE" : "INVOICE";
  page.drawText(title, {
    x: right - bold.widthOfTextAtSize(title, 14),
    y: y + 4,
    size: 14,
    font: bold,
    color: ink,
  });
  page.drawText(inv.number, {
    x: right - font.widthOfTextAtSize(inv.number, 11),
    y: y - 14,
    size: 11,
    font,
    color: gray,
  });
  y -= 18;
  if (company.legal_name) {
    page.drawText(company.legal_name, { x: left, y, size: 9, font, color: gray });
    y -= 12;
  }
  for (const line of (company.address ?? "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 9, font, color: gray });
    y -= 12;
  }

  y -= 18;
  page.drawText("BILL TO", { x: left, y, size: 8, font: bold, color: gray });
  const dates = [
    inv.issued_at ? `Issued: ${inv.issued_at.slice(0, 10)}` : null,
    inv.due_date ? `Due: ${inv.due_date}` : null,
  ].filter(Boolean) as string[];
  dates.forEach((d, i) => {
    page.drawText(d, {
      x: right - font.widthOfTextAtSize(d, 10),
      y: y - i * 13,
      size: 10,
      font,
      color: ink,
    });
  });
  y -= 14;
  page.drawText(inv.clients?.name ?? "", { x: left, y, size: 12, font: bold, color: ink });
  y -= 14;
  for (const line of (inv.clients?.billing_address ?? "").split("\n").filter(Boolean)) {
    page.drawText(line, { x: left, y, size: 9, font, color: gray });
    y -= 12;
  }

  // line table
  y -= 24;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 20, color: rgb(0.95, 0.95, 0.93) });
  page.drawText("DESCRIPTION", { x: left + 8, y, size: 8, font: bold, color: gray });
  page.drawText("QTY", { x: 360, y, size: 8, font: bold, color: gray });
  page.drawText("UNIT", { x: 415, y, size: 8, font: bold, color: gray });
  page.drawText("AMOUNT", {
    x: right - 8 - bold.widthOfTextAtSize("AMOUNT", 8),
    y, size: 8, font: bold, color: gray,
  });
  y -= 22;

  const lines = [...inv.invoice_lines].sort((a, b) => a.position - b.position);
  for (const l of lines) {
    const desc = l.description.length > 58 ? l.description.slice(0, 55) + "…" : l.description;
    page.drawText(desc, { x: left + 8, y, size: 9, font, color: ink });
    page.drawText(String(l.quantity), { x: 360, y, size: 9, font, color: ink });
    page.drawText(money(l.unit_price_minor), { x: 415, y, size: 9, font, color: ink });
    const amt = money(l.amount_minor);
    page.drawText(amt, {
      x: right - 8 - font.widthOfTextAtSize(amt, 9),
      y, size: 9, font, color: ink,
    });
    y -= 16;
    if (y < 160) break; // single-page v1
  }

  // totals
  y -= 10;
  const totalRow = (label: string, value: string, emph = false) => {
    const f = emph ? bold : font;
    const size = emph ? 11 : 9;
    page.drawText(label, { x: 380, y, size, font: f, color: emph ? ink : gray });
    page.drawText(value, {
      x: right - 8 - f.widthOfTextAtSize(value, size),
      y, size, font: f, color: ink,
    });
    y -= emph ? 18 : 14;
  };
  totalRow("Subtotal", money(inv.subtotal_minor));
  if (inv.tax_total_minor !== 0) totalRow("Tax", money(inv.tax_total_minor));
  totalRow("Total", money(inv.total_minor), true);

  if (company.bank_details) {
    let by = 100;
    page.drawText("PAYMENT DETAILS", { x: left, y: by, size: 8, font: bold, color: gray });
    by -= 13;
    for (const line of company.bank_details.split("\n").filter(Boolean).slice(0, 4)) {
      page.drawText(line, { x: left, y: by, size: 9, font, color: ink });
      by -= 12;
    }
  }

  return await doc.save();
}
