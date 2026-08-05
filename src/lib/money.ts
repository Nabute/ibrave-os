/**
 * Money is integer minor units + currency code everywhere (convention #2).
 * Formatting happens only at render time; arithmetic stays in integers.
 */
export function formatMinor(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

/** Parse a user-typed major-unit amount ("1,234.50") into minor units. */
export function parseToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
