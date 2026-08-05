import type { InvoiceStatus } from "@/lib/api";
import type { BadgeProps } from "@/components/ui/badge";

/** Backend status → badge kind (meqenet StatusBadge pattern). */
export const INVOICE_BADGE: Record<InvoiceStatus, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  issued: "default",
  paid: "success",
  partially_paid: "warning",
  overdue: "destructive",
  void: "outline",
};
