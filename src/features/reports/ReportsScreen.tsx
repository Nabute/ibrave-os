import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] ?? "";
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(",")
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const api = useApi();
  const unbilled = useQuery({ queryKey: ["r-unbilled"], queryFn: () => api.reports.unbilled() });
  const aging = useQuery({ queryKey: ["r-aging"], queryFn: () => api.reports.aging() });
  const utilization = useQuery({
    queryKey: ["r-utilization"],
    queryFn: () => api.reports.utilization(),
  });
  const burn = useQuery({ queryKey: ["r-burn"], queryFn: () => api.reports.burn() });
  const margin = useQuery({ queryKey: ["r-margin"], queryFn: () => api.payouts.margin() });

  return (
    <div className="space-y-4">
      <h1>Reports</h1>
      <Tabs defaultValue="unbilled">
        <TabsList>
          <TabsTrigger value="unbilled">Unbilled work</TabsTrigger>
          <TabsTrigger value="aging">Invoice aging</TabsTrigger>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="burn">Project burn</TabsTrigger>
          <TabsTrigger value="margin">Margin</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
        </TabsList>

        <TabsContent value="unbilled">
          <Card>
            <CardContent className="pt-4">
              <div className="mb-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("unbilled.csv", (unbilled.data ?? []) as never)}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Oldest entry</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unbilled.data ?? []).map((r) => (
                    <TableRow key={r.project_id}>
                      <TableCell>{r.client_name}</TableCell>
                      <TableCell>{r.project_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.oldest_entry}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.hours}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(r.value_minor, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(unbilled.data ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No revenue leakage — everything approved is invoiced.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card>
            <CardContent className="pt-4">
              <div className="mb-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("aging.csv", (aging.data ?? []) as never)}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(aging.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.number}</TableCell>
                      <TableCell>{r.client_name}</TableCell>
                      <TableCell>{r.due_date}</TableCell>
                      <TableCell>
                        <Badge variant={r.bucket === "current" ? "secondary" : "destructive"}>
                          {r.bucket}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(r.outstanding_minor, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilization">
          <Card>
            <CardContent className="pt-4">
              <div className="mb-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("utilization.csv", (utilization.data ?? []) as never)}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Billable h</TableHead>
                    <TableHead className="text-right">Total h</TableHead>
                    <TableHead className="text-right">Billable %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(utilization.data ?? []).map((r) => (
                    <TableRow key={`${r.user_id}:${r.month}`}>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell>{r.month?.slice(0, 7)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.billable_hours ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_hours}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.billable_pct ?? 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="burn">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Approved h</TableHead>
                    <TableHead className="text-right">Budget h</TableHead>
                    <TableHead className="text-right">Burn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(burn.data ?? []).map((r) => (
                    <TableRow key={r.project_id}>
                      <TableCell>{r.project_name}</TableCell>
                      <TableCell>{r.client_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.approved_hours}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.budget_hours ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.burn_pct != null ? (
                          <span
                            className={
                              Number(r.burn_pct) >= 90 ? "font-semibold text-destructive" : ""
                            }
                          >
                            {r.burn_pct}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="margin">
          <Card>
            <CardContent className="pt-4">
              <div className="mb-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv("margin.csv", (margin.data ?? []) as never)}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(margin.data ?? []).map((r) => (
                    <TableRow key={`${r.project_id}:${r.month}`}>
                      <TableCell>{r.project_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.client_name}</TableCell>
                      <TableCell>{r.month.slice(0, 7)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(r.revenue_minor, r.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(r.cost_minor, r.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium tabular-nums ${
                          r.margin_minor < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatMinor(r.margin_minor, r.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.margin_pct != null ? `${r.margin_pct}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Revenue = invoiced T&M value of stamped entries plus issued milestone
                lines; cost = approved hours × cost rate. Retainer revenue is reported
                on the invoice, not allocated per project here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="accounting">
          <AccountingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** D-5: the monthly journal for your accountant — map account codes once in
 *  Admin → Company settings, reuse forever. */
function AccountingTab() {
  const api = useApi();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const monthStart = `${month}-01`;
  const monthEnd = format(
    new Date(new Date(`${month}-01T00:00:00`).getFullYear(), new Date(`${month}-01T00:00:00`).getMonth() + 1, 0),
    "yyyy-MM-dd"
  );

  const { data: rows } = useQuery({
    queryKey: ["r-accounting", month],
    queryFn: () => api.reports.accounting(monthStart, monthEnd),
  });

  const totalDebit = (rows ?? []).reduce((s, r) => s + r.debit_minor, 0);
  const totalCredit = (rows ?? []).reduce((s, r) => s + r.credit_minor, 0);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Input
            type="month"
            className="w-44"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `journal-${month}.csv`,
                (rows ?? []).map((r) => ({
                  date: r.entry_date,
                  document: r.doc_number,
                  party: r.party,
                  account: r.account,
                  account_name: r.account_name,
                  debit: (r.debit_minor / 100).toFixed(2),
                  credit: (r.credit_minor / 100).toFixed(2),
                  currency: r.currency,
                }))
              )
            }
          >
            <Download className="h-4 w-4" /> CSV for accountant
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-medium">{r.doc_number}</TableCell>
                <TableCell className="text-muted-foreground">{r.party}</TableCell>
                <TableCell>
                  {r.account} · {r.account_name}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.debit_minor !== 0 ? formatMinor(r.debit_minor, r.currency) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.credit_minor !== 0 ? formatMinor(r.credit_minor, r.currency) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-right text-sm tabular-nums">
          <span className={totalDebit === totalCredit ? "text-muted-foreground" : "font-semibold text-destructive"}>
            Debits {formatMinor(totalDebit, "USD")} · Credits {formatMinor(totalCredit, "USD")}
            {totalDebit === totalCredit ? " · balanced ✓" : " · NOT BALANCED"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
