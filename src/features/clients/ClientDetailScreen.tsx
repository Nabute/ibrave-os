import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { INVOICE_BADGE } from "@/features/invoicing/status";

/** Account 360 (lite, G-1): billing info, contacts, projects, invoice history. */
export function ClientDetailScreen() {
  const { clientId } = useParams({ strict: false }) as { clientId: string };
  const api = useApi();

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.clients.get(clientId),
  });
  const { data: contacts } = useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: () => api.clients.contacts(clientId),
  });
  const { data: projects } = useQuery({
    queryKey: ["client-projects", clientId],
    queryFn: () => api.clients.projects(clientId),
  });
  const { data: invoices } = useQuery({
    queryKey: ["client-invoices", clientId],
    queryFn: () => api.clients.invoices(clientId),
  });

  if (!client) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {client.legal_name ?? ""} · {client.currency} · Net {client.payment_terms_days} ·
          grouped by {client.invoice_grouping}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(contacts ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    {c.name}
                    <span className="ml-2 text-muted-foreground">{c.email}</span>
                  </span>
                  <Badge variant="secondary">{c.contact_role}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(projects ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {p.billing_model.toUpperCase()} · {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Invoice history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoices ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        to="/invoices/$invoiceId"
                        params={{ invoiceId: inv.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {inv.number ?? "(draft)"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.period_start} → {inv.period_end}
                    </TableCell>
                    <TableCell>
                      <Badge variant={INVOICE_BADGE[inv.status]}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(inv.total_minor, inv.currency)}
                    </TableCell>
                    <TableCell>{inv.due_date ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
