import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CompanySettings, Invoice } from "@/lib/api";

/**
 * The branded invoice document — mirrors the official iBrave template
 * (teal header band, FROM/BILL TO boxes, meta grid, detailed line table,
 * totals with Total-due band, payment instructions, issued-by block).
 * Every field is data-driven: company_settings, clients, and the invoice.
 * Used on screen and for print (print CSS keeps it clean on A4).
 */
export function InvoiceDocument({
  invoice,
  settings,
  isDraft,
  onDeleteLine,
}: {
  invoice: Invoice;
  settings: CompanySettings | undefined;
  isDraft: boolean;
  onDeleteLine?: (lineId: string) => void;
}) {
  const cur = invoice.currency;
  const money = (minor: number) =>
    `${cur} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const client = invoice.clients;
  const title = invoice.kind === "credit_note" ? "CREDIT NOTE" : "INVOICE";
  const lines = [...(invoice.invoice_lines ?? [])].sort((a, b) => a.position - b.position);
  const fmtDate = (d: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          ...opts,
        })
      : "—";

  const box = "border bg-muted/30 p-4";
  const boxLabel = "mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary";

  return (
    // Documents keep paper width even in the full-bleed workspace.
    <div className="mx-auto w-full max-w-[920px] rounded-lg border bg-card print:max-w-none print:rounded-none print:border-0">
      {/* Header band */}
      <div className="flex items-start justify-between bg-invoice-brand px-8 py-6 text-white/80 print:-mx-0">
        <div>
          <p className="font-display text-2xl font-semibold text-white">
            {settings?.company_name ?? "iBrave"}
          </p>
          <p className="mt-0.5 text-sm text-white/60">{settings?.tagline}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold tracking-wide text-white">{title}</p>
          <p className="mt-1 text-xs text-white/60">
            No. {invoice.number ?? "DRAFT"}
          </p>
        </div>
      </div>

      <div className="space-y-6 p-8">
        {/* FROM / BILL TO */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={box}>
            <p className={boxLabel}>From</p>
            <p className="text-sm font-bold">{settings?.legal_name ?? settings?.company_name}</p>
            {(settings?.address ?? "").split("\n").map((l, i) => (
              <p key={i} className="text-sm">{l}</p>
            ))}
            {settings?.tin && <p className="text-sm">TIN: {settings.tin}</p>}
            {settings?.registration_no && (
              <p className="text-sm">Registration No.: {settings.registration_no}</p>
            )}
          </div>
          <div className={box}>
            <p className={boxLabel}>Bill to</p>
            <p className="text-sm font-bold">{client?.legal_name ?? client?.name}</p>
            {(client?.billing_address ?? "").split("\n").map((l, i) => (
              <p key={i} className="text-sm">{l}</p>
            ))}
            {client?.org_no && <p className="text-sm">Org. No.: {client.org_no}</p>}
            {client?.vat_no && <p className="text-sm">VAT No.: {client.vat_no}</p>}
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 border text-sm sm:grid-cols-4">
          {[
            ["Invoice date", invoice.issued_at ? fmtDate(invoice.issued_at) : "— (draft)"],
            [
              "Service period",
              invoice.period_start
                ? `${fmtDate(invoice.period_start, { month: "short" })} – ${fmtDate(invoice.period_end, { month: "short" })}`
                : "—",
            ],
            ["Due date", fmtDate(invoice.due_date)],
            ["Payment terms", `Net ${client?.payment_terms_days ?? 30} days`],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-r p-2.5 last:border-r-0 sm:border-b-0 [&:nth-child(2)]:border-r sm:[&:nth-child(2)]:border-r [&:nth-child(even)]:border-r-0 sm:[&:nth-child(even)]:border-r">
              <p className="text-[11px] font-bold text-primary">{label}</p>
              <p>{value}</p>
            </div>
          ))}
        </div>

        {settings?.invoice_intro && (
          <p className="text-sm leading-relaxed">{settings.invoice_intro}</p>
        )}

        {/* Line table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-invoice-brand text-left text-white/90">
              <th className="w-8 px-3 py-2 text-xs font-bold">#</th>
              <th className="px-3 py-2 text-xs font-bold">Description</th>
              <th className="px-3 py-2 text-right text-xs font-bold">Hours/Qty</th>
              <th className="px-3 py-2 text-right text-xs font-bold">Rate</th>
              <th className="px-3 py-2 text-right text-xs font-bold">Amount</th>
              {isDraft && <th className="no-print w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const [first, ...rest] = l.description.split("\n");
              return (
                <tr key={l.id} className="border-b align-top">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{first}</p>
                    {rest.length > 0 && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {rest.join(" ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {Number(l.quantity).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(l.unit_price_minor)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(l.amount_minor)}
                  </td>
                  {isDraft && (
                    <td className="no-print px-1 py-1.5">
                      {l.kind === "manual" && onDeleteLine && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          aria-label="Delete line"
                          onClick={() => onDeleteLine(l.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Notes + totals */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {invoice.notes && (
              <>
                <span className="font-semibold text-foreground">Supporting documents: </span>
                {invoice.notes}
              </>
            )}
          </div>
          <table className="w-72 text-sm">
            <tbody>
              <tr className="border">
                <td className="border-r bg-muted/30 px-3 py-1.5 text-right font-semibold">
                  Subtotal
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {money(invoice.subtotal_minor)}
                </td>
              </tr>
              <tr className="border">
                <td className="border-r bg-muted/30 px-3 py-1.5 text-right font-semibold">
                  VAT
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {money(invoice.tax_total_minor)}
                </td>
              </tr>
              <tr className="border bg-invoice-brand text-white">
                <td className="px-3 py-2 text-right font-bold">Total due</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">
                  {money(invoice.total_minor)}
                </td>
              </tr>
              <tr className="border">
                <td className="border-r bg-muted/30 px-3 py-1.5 text-right font-semibold">
                  Currency
                </td>
                <td className="px-3 py-1.5 text-right">{cur}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment instructions */}
        <div className="space-y-1.5 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            Payment instructions
          </p>
          {settings?.payment_instructions && (
            <p>
              <span className="font-semibold">Payment method: </span>
              {settings.payment_instructions}
            </p>
          )}
          {invoice.number && (
            <p>
              <span className="font-semibold">Payment reference: </span>
              {invoice.number}
            </p>
          )}
          {settings?.vat_note && (
            <p>
              <span className="font-semibold">VAT note: </span>
              {settings.vat_note}
            </p>
          )}
          {settings?.bank_details && (
            <p className="whitespace-pre-line">{settings.bank_details}</p>
          )}
        </div>

        {/* Issued by / contact */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={box}>
            <p className={boxLabel}>Issued by</p>
            <p className="text-sm">{settings?.issuer_name ?? ""}</p>
            {settings?.issuer_title && <p className="text-sm">{settings.issuer_title}</p>}
            <p className="text-sm">{settings?.legal_name ?? settings?.company_name}</p>
          </div>
          <div className={box}>
            <p className={boxLabel}>Contact</p>
            {(settings?.address ?? "").split("\n").slice(-1).map((l, i) => (
              <p key={i} className="text-sm">{l}</p>
            ))}
            {settings?.contact_note && <p className="text-sm">{settings.contact_note}</p>}
          </div>
        </div>

        <p className="border-t pt-3 text-center text-xs text-muted-foreground">
          {settings?.legal_name ?? settings?.company_name} | {title.charAt(0) + title.slice(1).toLowerCase()}{" "}
          {invoice.number ?? "(draft)"}
        </p>
      </div>
    </div>
  );
}
