// Server-side invoice PDF — mirrors the official iBrave template: teal header
// band, FROM/BILL TO boxes, meta grid, detailed line table, Total-due band,
// payment instructions, issued-by block. All content is data-driven.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface InvoicePdfData {
  number: string;
  kind: string;
  issued_at: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  subtotal_minor: number;
  tax_total_minor: number;
  total_minor: number;
  notes: string | null;
  clients: {
    name: string;
    legal_name: string | null;
    billing_address: string | null;
    org_no: string | null;
    vat_no: string | null;
    payment_terms_days: number;
  } | null;
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
  tagline: string;
  address: string | null;
  tin: string | null;
  registration_no: string | null;
  bank_details: string | null;
  invoice_intro: string;
  payment_instructions: string;
  vat_note: string;
  contact_note: string;
  issuer_name: string | null;
  issuer_title: string | null;
}

const teal = rgb(0.12, 0.29, 0.29);
const ink = rgb(0.12, 0.15, 0.17);
const gray = rgb(0.42, 0.45, 0.47);
const boxBg = rgb(0.965, 0.965, 0.955);
const white = rgb(1, 1, 1);

const A4: [number, number] = [595, 842];
const L = 48;
const R = 547;

export async function buildInvoicePdf(
  inv: InvoicePdfData,
  co: CompanyBlock
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const money = (minor: number) =>
    `${inv.currency} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "—";

  const text = (
    s: string, x: number, y: number,
    o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}
  ) => {
    const f = o.f ?? font;
    const size = o.size ?? 9;
    const px = o.right ? x - f.widthOfTextAtSize(s, size) : x;
    page.drawText(s, { x: px, y, size, font: f, color: o.color ?? ink });
  };

  const wrap = (s: string, f: PDFFont, size: number, width: number): string[] => {
    const words = s.split(/\s+/);
    const out: string[] = [];
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > width && line) {
        out.push(line);
        line = w;
      } else line = trial;
    }
    if (line) out.push(line);
    return out;
  };

  // ── Header band ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: L - 8, y: 748, width: R - L + 16, height: 62, color: teal });
  text(co.company_name, L + 8, 782, { size: 17, f: bold, color: white });
  text(co.tagline, L + 8, 766, { size: 8.5, color: rgb(0.75, 0.82, 0.8) });
  const title = inv.kind === "credit_note" ? "CREDIT NOTE" : "INVOICE";
  text(title, R - 8, 778, { size: 22, f: bold, color: white, right: true });
  text(`No. ${inv.number}`, R - 8, 760, { size: 8.5, color: rgb(0.75, 0.82, 0.8), right: true });

  // ── FROM / BILL TO boxes ──────────────────────────────────────────────────
  const boxTop = 730;
  const boxH = 96;
  const colW = (R - L - 12) / 2;
  const drawBox = (x: number, label: string, lines: [string, boolean][]) => {
    page.drawRectangle({
      x, y: boxTop - boxH, width: colW, height: boxH,
      color: boxBg, borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.7,
    });
    text(label, x + 10, boxTop - 16, { size: 8, f: bold, color: teal });
    let yy = boxTop - 30;
    for (const [s, b] of lines.slice(0, 5)) {
      text(s, x + 10, yy, { size: 8.5, f: b ? bold : font });
      yy -= 12.5;
    }
  };
  const fromLines: [string, boolean][] = [
    [co.legal_name ?? co.company_name, true],
    ...(co.address ?? "").split("\n").filter(Boolean).map((l): [string, boolean] => [l, false]),
    ...(co.tin ? [[`TIN: ${co.tin}`, false] as [string, boolean]] : []),
    ...(co.registration_no
      ? [[`Registration No.: ${co.registration_no}`, false] as [string, boolean]]
      : []),
  ];
  const cl = inv.clients;
  const billLines: [string, boolean][] = [
    [cl?.legal_name ?? cl?.name ?? "", true],
    ...(cl?.billing_address ?? "").split("\n").filter(Boolean).map((l): [string, boolean] => [l, false]),
    ...(cl?.org_no ? [[`Org. No.: ${cl.org_no}`, false] as [string, boolean]] : []),
    ...(cl?.vat_no ? [[`VAT No.: ${cl.vat_no}`, false] as [string, boolean]] : []),
  ];
  drawBox(L, "FROM", fromLines);
  drawBox(L + colW + 12, "BILL TO", billLines);

  // ── Meta grid ─────────────────────────────────────────────────────────────
  let y = boxTop - boxH - 18;
  const metaRow = (cells: [string, string][], yy: number) => {
    const cw = (R - L) / 4;
    page.drawRectangle({
      x: L, y: yy - 20, width: R - L, height: 20,
      borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.7,
    });
    cells.forEach(([label, value], i) => {
      text(label, L + i * cw * 2 + 8, yy - 13.5, { size: 8, f: bold, color: teal });
      text(value, L + i * cw * 2 + cw, yy - 13.5, { size: 8.5 });
    });
  };
  const period =
    inv.period_start && inv.period_end
      ? `${fmtDate(inv.period_start)} - ${fmtDate(inv.period_end)}`
      : "—";
  metaRow([["Invoice date", fmtDate(inv.issued_at)], ["Service period", period]], y);
  y -= 20;
  metaRow(
    [["Due date", fmtDate(inv.due_date)], ["Payment terms", `Net ${cl?.payment_terms_days ?? 30} days`]],
    y
  );
  y -= 34;

  // ── Intro ─────────────────────────────────────────────────────────────────
  for (const line of wrap(co.invoice_intro, font, 9, R - L)) {
    text(line, L, y);
    y -= 12;
  }
  y -= 8;

  // ── Line table ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 20, color: teal });
  text("#", L + 8, y, { size: 8, f: bold, color: white });
  text("Description", L + 32, y, { size: 8, f: bold, color: white });
  text("Hours", 388, y, { size: 8, f: bold, color: white, right: true });
  text("Rate", 458, y, { size: 8, f: bold, color: white, right: true });
  text("Amount", R - 8, y, { size: 8, f: bold, color: white, right: true });
  y -= 24;

  const lines = [...inv.invoice_lines].sort((a, b) => a.position - b.position);
  lines.forEach((l, i) => {
    if (y < 220) return; // single page v1
    const [first, ...rest] = l.description.split("\n");
    const firstWrapped = wrap(first, bold, 9, 240);
    text(String(i + 1), L + 8, y, { size: 9, color: gray });
    firstWrapped.forEach((s, j) => text(s, L + 32, y - j * 11, { size: 9, f: bold }));
    let dy = y - firstWrapped.length * 11;
    if (rest.length > 0) {
      for (const s of wrap(rest.join(" "), font, 7.5, 240).slice(0, 3)) {
        text(s, L + 32, dy, { size: 7.5, color: gray });
        dy -= 9.5;
      }
    }
    text(Number(l.quantity).toFixed(2), 388, y, { size: 9, right: true });
    text(money(l.unit_price_minor), 458, y, { size: 9, right: true });
    text(money(l.amount_minor), R - 8, y, { size: 9, right: true });
    y = Math.min(dy, y - 14) - 8;
    page.drawLine({
      start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 },
      thickness: 0.5, color: rgb(0.88, 0.88, 0.86),
    });
    y -= 6;
  });

  // ── Notes (left) + totals (right) ─────────────────────────────────────────
  const totalsTop = y;
  if (inv.notes) {
    text("Supporting documents:", L, totalsTop, { size: 8, f: bold });
    let ny = totalsTop - 11;
    for (const s of wrap(inv.notes, font, 7.5, 230).slice(0, 4)) {
      text(s, L, ny, { size: 7.5, color: gray });
      ny -= 9.5;
    }
  }
  const totalRow = (label: string, value: string, yy: number, emph = false) => {
    const x0 = 340;
    page.drawRectangle({
      x: x0, y: yy - 6, width: R - x0, height: 19,
      color: emph ? teal : boxBg,
      borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.7,
    });
    text(label, 452, yy, { size: emph ? 9.5 : 8.5, f: bold, color: emph ? white : ink, right: true });
    text(value, R - 8, yy, { size: emph ? 9.5 : 8.5, f: emph ? bold : font, color: emph ? white : ink, right: true });
  };
  totalRow("Subtotal", money(inv.subtotal_minor), totalsTop);
  totalRow("VAT", money(inv.tax_total_minor), totalsTop - 19);
  totalRow("Total due", money(inv.total_minor), totalsTop - 38, true);
  totalRow("Currency", inv.currency, totalsTop - 57);
  y = totalsTop - 84;

  // ── Payment instructions ──────────────────────────────────────────────────
  text("PAYMENT INSTRUCTIONS", L, y, { size: 8.5, f: bold, color: teal });
  y -= 14;
  const para = (label: string, body: string) => {
    const prefix = `${label}: `;
    const wrapped = wrap(prefix + body, font, 8.5, R - L);
    wrapped.forEach((s, i) => {
      if (i === 0) {
        text(prefix, L, y, { size: 8.5, f: bold });
        text(s.slice(prefix.length), L + bold.widthOfTextAtSize(prefix, 8.5), y, { size: 8.5 });
      } else {
        text(s, L, y, { size: 8.5 });
      }
      y -= 11.5;
    });
    y -= 2;
  };
  para("Payment method", co.payment_instructions);
  para("Payment reference", inv.number);
  para("VAT note", co.vat_note);
  y -= 6;

  // ── Issued by / contact ───────────────────────────────────────────────────
  const ibH = 66;
  const issued: [string, boolean][] = [
    ...(co.issuer_name ? [[co.issuer_name, false] as [string, boolean]] : []),
    ...(co.issuer_title ? [[co.issuer_title, false] as [string, boolean]] : []),
    [co.legal_name ?? co.company_name, false],
  ];
  const cityLine = (co.address ?? "").split("\n").filter(Boolean).slice(-1);
  const contact: [string, boolean][] = [
    ...cityLine.map((l): [string, boolean] => [l, false]),
    [co.contact_note, false],
  ];
  const drawSmallBox = (x: number, label: string, ls: [string, boolean][]) => {
    page.drawRectangle({
      x, y: y - ibH, width: colW, height: ibH,
      color: boxBg, borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.7,
    });
    text(label, x + 10, y - 15, { size: 8, f: bold, color: teal });
    let yy = y - 29;
    for (const [s] of ls.slice(0, 3)) {
      for (const w of wrap(s, font, 8.5, colW - 20).slice(0, 1)) {
        text(w, x + 10, yy, { size: 8.5 });
      }
      yy -= 12;
    }
  };
  drawSmallBox(L, "Issued by", issued);
  drawSmallBox(L + colW + 12, "Contact", contact);

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = `${co.legal_name ?? co.company_name} | ${
    inv.kind === "credit_note" ? "Credit note" : "Invoice"
  } ${inv.number}`;
  text(footer, (595 - font.widthOfTextAtSize(footer, 7.5)) / 2, 30, {
    size: 7.5,
    color: gray,
  });

  return await doc.save();
}
