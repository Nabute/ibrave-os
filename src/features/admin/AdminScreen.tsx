import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toDisplayMessage, type AppRole } from "@/lib/api";
import { useApi } from "@/lib/session";

const ALL_ROLES: AppRole[] = [
  "employee",
  "pm",
  "finance",
  "recruiter",
  "resourcing",
  "sales",
  "account_owner",
  "owner",
  "admin",
];

export function AdminScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, AppRole | "">>({});

  const { data: people } = useQuery({
    queryKey: ["admin-people"],
    queryFn: () => api.admin.people(),
  });
  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.admin.settings(),
  });
  const [settingsForm, setSettingsForm] = useState<Record<string, string> | null>(null);

  const invalidatePeople = () => void qc.invalidateQueries({ queryKey: ["admin-people"] });

  const grantMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) =>
      api.admin.grantRole(userId, role),
    onSuccess: invalidatePeople,
    onError: (e) => setError(toDisplayMessage(e)),
  });
  const revokeMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) =>
      api.admin.revokeRole(userId, role),
    onSuccess: invalidatePeople,
    onError: (e) => setError(toDisplayMessage(e)),
  });
  const settingsMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.admin.updateSettings(patch),
    onSuccess: () => {
      setSettingsForm(null);
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People & roles</TabsTrigger>
          <TabsTrigger value="settings">Company settings</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-64">Grant role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(people ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell>{p.employment_type}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.user_roles.map((r) => (
                            <Badge
                              key={r.role}
                              variant="secondary"
                              className="cursor-pointer"
                              title="Click to revoke"
                              onClick={() =>
                                revokeMutation.mutate({ userId: p.id, role: r.role })
                              }
                            >
                              {r.role} ×
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Select
                            value={pendingRole[p.id] ?? ""}
                            onValueChange={(v) =>
                              setPendingRole({ ...pendingRole, [p.id]: v as AppRole })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="role…" />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.filter(
                                (r) => !p.user_roles.some((ur) => ur.role === r)
                              ).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!pendingRole[p.id]}
                            onClick={() => {
                              grantMutation.mutate({
                                userId: p.id,
                                role: pendingRole[p.id] as AppRole,
                              });
                              setPendingRole({ ...pendingRole, [p.id]: "" });
                            }}
                          >
                            Grant
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Company settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings && (
                <div className="grid max-w-xl gap-3">
                  {(
                    [
                      ["company_name", "Company name"],
                      ["legal_name", "Legal name"],
                      ["address", "Address"],
                      ["base_currency", "Base currency"],
                      ["invoice_prefix", "Invoice prefix"],
                      ["credit_note_prefix", "Credit note prefix"],
                      ["bank_details", "Bank details (shown on invoices)"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label>{label}</Label>
                      <Input
                        value={
                          settingsForm?.[key] ??
                          String(settings[key as keyof typeof settings] ?? "")
                        }
                        onChange={(e) =>
                          setSettingsForm({ ...(settingsForm ?? {}), [key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <Button
                    className="w-fit"
                    disabled={!settingsForm || settingsMutation.isPending}
                    onClick={() => settingsForm && settingsMutation.mutate(settingsForm)}
                  >
                    Save settings
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
