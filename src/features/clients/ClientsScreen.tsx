import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BulkActionBar, RowCheckbox, TableToolbar } from "@/components/TableToolbar";
import { useTableControls } from "@/lib/useTableControls";
import { Link } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { LocalClock } from "@/components/LocalClock";
import { TableSkeleton } from "@/components/Skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toDisplayMessage } from "@/lib/api";
import { useApi } from "@/lib/session";
import { HEALTH_BADGE } from "./ClientDetailScreen";

export function ClientsScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", contact_email: "", currency: "USD" });

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list(),
  });
  const controls = useTableControls(clients ?? [], {
    getId: (c) => c.id,
    haystack: (c) => `${c.name} ${c.code ?? ""} ${c.currency} ${c.tier}`,
    facets: [
      { key: "tier", label: "Tier", get: (c) => c.tier },
      { key: "currency", label: "Currency", get: (c) => c.currency },
      {
        key: "active",
        label: "Status",
        get: (c) => (c.active ? "active" : "inactive"),
        options: [
          { value: "active", label: "active" },
          { value: "inactive", label: "inactive" },
        ],
      },
    ],
  });
  const { data: health } = useQuery({
    queryKey: ["account-health"],
    queryFn: () => api.accounts.health(),
  });
  const healthByClient = new Map((health ?? []).map((h) => [h.client_id, h]));

  const createMutation = useMutation({
    mutationFn: () =>
      api.clients.create({
        name: form.name,
        contact_email: form.contact_email || null,
        currency: form.currency,
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: "", contact_email: "", currency: "USD" });
      void qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>Clients</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New client</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Billing email</Label>
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency (ISO)</Label>
                <Input
                  value={form.currency}
                  maxLength={3}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.name || createMutation.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : (clients ?? []).length === 0 ? (
            <EmptyState
              icon={Building2}
              sentence="No clients yet"
              description="Clients arrive automatically when sales wins a deal, or add one directly to start billing."
              action="New client"
              onAction={() => setOpen(true)}
            />
          ) : (
          <>
          <TableToolbar
            query={controls.query}
            onQuery={controls.setQuery}
            facets={controls.facets}
            count={controls.rows.length}
            total={(clients ?? []).length}
            placeholder="Search clients, code, currency"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Local time</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {controls.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: c.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const h = healthByClient.get(c.id);
                      return h ? (
                        <Badge variant={HEALTH_BADGE[h.light]}>
                          {h.light} · {h.score}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {c.timezone ? (
                      <LocalClock timezone={c.timezone} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="uppercase text-muted-foreground">{c.tier}</TableCell>
                  <TableCell>{c.currency}</TableCell>
                  <TableCell>Net {c.payment_terms_days}</TableCell>
                  <TableCell>
                    <Badge variant={c.active ? "success" : "secondary"}>
                      {c.active ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
