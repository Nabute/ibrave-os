import { useQuery } from "@tanstack/react-query";
import { useUrlTab } from "@/lib/useUrlTab";
import { format } from "date-fns";
import { BadgeCheck, Download } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHead } from "@/components/SortHead";
import { TableSkeleton } from "@/components/Skeletons";
import { formatMinor } from "@/lib/money";
import { useApi } from "@/lib/session";
import { useSort } from "@/lib/useSort";

/** Ledger: zero renders as a muted em-dash, never "0.00". */
const orDash = (isZero: boolean, formatted: string) =>
  isZero ? <span className="text-muted-foreground">-</span> : formatted;

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
  const [tab, setTab] = useUrlTab("unbilled");
  const api = useApi();
  const unbilled = useQuery({ queryKey: ["r-unbilled"], queryFn: () => api.reports.unbilled() });
  const aging = useQuery({ queryKey: ["r-aging"], queryFn: () => api.reports.aging() });
  const utilization = useQuery({
    queryKey: ["r-utilization"],
    queryFn: () => api.reports.utilization(),
  });
  const burn = useQuery({ queryKey: ["r-burn"], queryFn: () => api.reports.burn() });
  const margin = useQuery({ queryKey: ["r-margin"], queryFn: () => api.payouts.margin() });

  const agingSort = useSort(aging.data ?? [], "days_overdue");
  const unbilledSort = useSort(unbilled.data ?? [], "value_minor");
  const marginSort = useSort(margin.data ?? [], "month");

  return (
    <div className="space-y-4">
      <h1>Reports</h1>
      <Tabs value={tab} onValueChange={setTab}>
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
                    <SortHead sortKey="client_name" current={unbilledSort.sortKey} dir={unbilledSort.dir} onSort={unbilledSort.toggle}>
                      Client
                    </SortHead>
                    <TableHead>Project</TableHead>
                    <SortHead sortKey="oldest_entry" current={unbilledSort.sortKey} dir={unbilledSort.dir} onSort={unbilledSort.toggle}>
                      Oldest entry
                    </SortHead>
                    <SortHead sortKey="hours" current={unbilledSort.sortKey} dir={unbilledSort.dir} onSort={unbilledSort.toggle} className="text-right">
                      Hours
                    </SortHead>
                    <SortHead sortKey="value_minor" current={unbilledSort.sortKey} dir={unbilledSort.dir} onSort={unbilledSort.toggle} className="text-right">
                      Value
                    </SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unbilledSort.rows.map((r) => (
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
                {unbilledSort.rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {unbilledSort.rows.reduce((s, r) => s + Number(r.hours), 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          unbilledSort.rows.reduce((s, r) => s + r.value_minor, 0),
                          unbilledSort.rows[0].currency
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
              {unbilled.isLoading && <TableSkeleton rows={4} cols={5} />}
              {!unbilled.isLoading && (unbilled.data ?? []).length === 0 && (
                <EmptyState
                  icon={BadgeCheck}
                  sentence="No revenue leakage"
                  description="Every approved, billable hour is on an invoice. This report only has rows when money is being left on the table."
                />
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
                    <SortHead sortKey="number" current={agingSort.sortKey} dir={agingSort.dir} onSort={agingSort.toggle}>
                      Invoice
                    </SortHead>
                    <SortHead sortKey="client_name" current={agingSort.sortKey} dir={agingSort.dir} onSort={agingSort.toggle}>
                      Client
                    </SortHead>
                    <SortHead sortKey="due_date" current={agingSort.sortKey} dir={agingSort.dir} onSort={agingSort.toggle}>
                      Due
                    </SortHead>
                    <SortHead sortKey="days_overdue" current={agingSort.sortKey} dir={agingSort.dir} onSort={agingSort.toggle}>
                      Bucket
                    </SortHead>
                    <SortHead sortKey="outstanding_minor" current={agingSort.sortKey} dir={agingSort.dir} onSort={agingSort.toggle} className="text-right">
                      Outstanding
                    </SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingSort.rows.map((r) => (
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
                {agingSort.rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>Total outstanding</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          agingSort.rows.reduce((s, r) => s + r.outstanding_minor, 0),
                          agingSort.rows[0].currency
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
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
                        {orDash(!r.billable_hours, String(r.billable_hours ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_hours}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {orDash(!r.billable_pct, `${r.billable_pct ?? 0}%`)}
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
                        {r.budget_hours ?? "-"}
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
                          "-"
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
                    <SortHead sortKey="project_name" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle}>
                      Project
                    </SortHead>
                    <SortHead sortKey="client_name" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle}>
                      Client
                    </SortHead>
                    <SortHead sortKey="month" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle}>
                      Month
                    </SortHead>
                    <SortHead sortKey="revenue_minor" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle} className="text-right">
                      Revenue
                    </SortHead>
                    <SortHead sortKey="cost_minor" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle} className="text-right">
                      Cost
                    </SortHead>
                    <SortHead sortKey="margin_minor" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle} className="text-right">
                      Margin
                    </SortHead>
                    <SortHead sortKey="margin_pct" current={marginSort.sortKey} dir={marginSort.dir} onSort={marginSort.toggle} className="text-right">
                      Margin %
                    </SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginSort.rows.map((r) => (
                    <TableRow key={`${r.project_id}:${r.month}`}>
                      <TableCell>{r.project_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.client_name}</TableCell>
                      <TableCell>{r.month.slice(0, 7)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {orDash(r.revenue_minor === 0, formatMinor(r.revenue_minor, r.currency))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {orDash(r.cost_minor === 0, formatMinor(r.cost_minor, r.currency))}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium tabular-nums ${
                          r.margin_minor < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatMinor(r.margin_minor, r.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.margin_pct != null ? `${r.margin_pct}%` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {marginSort.rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          marginSort.rows.reduce((s, r) => s + r.revenue_minor, 0),
                          marginSort.rows[0].currency
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          marginSort.rows.reduce((s, r) => s + r.cost_minor, 0),
                          marginSort.rows[0].currency
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          marginSort.rows.reduce((s, r) => s + r.margin_minor, 0) < 0
                            ? "text-destructive"
                            : ""
                        }`}
                      >
                        {formatMinor(
                          marginSort.rows.reduce((s, r) => s + r.margin_minor, 0),
                          marginSort.rows[0].currency
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
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

/** D-5: the monthly journal for your accountant, map account codes once in
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
