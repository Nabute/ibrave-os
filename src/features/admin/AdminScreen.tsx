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

function EmailIdentitiesTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", roles: [] as string[] });

  const { data: identities } = useQuery({
    queryKey: ["email-identities-admin"],
    queryFn: () => api.comms.identities(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["email-identities-admin"] });
    void qc.invalidateQueries({ queryKey: ["email-identities"] });
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.comms.addIdentity({
        email: form.email,
        display_name: form.display_name,
        allowed_roles: form.roles,
      }),
    onSuccess: () => {
      setForm({ email: "", display_name: "", roles: [] });
      setError(null);
      invalidate();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.comms.setIdentityActive(id, active),
    onSuccess: invalidate,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Department sender addresses</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            User-initiated email is never “noreply”: people send as themselves or as a
            department address their role entitles them to. The domain must be verified
            in Resend.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                className="w-56"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="talent@ibrave.co"
              />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                className="w-48"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="iBrave Talent"
              />
            </div>
            <div className="space-y-1">
              <Label>Roles allowed to use it</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.filter((r) => !["owner", "admin"].includes(r)).map((r) => {
                  const on = form.roles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          roles: on
                            ? form.roles.filter((x) => x !== r)
                            : [...form.roles, r],
                        })
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              disabled={!form.email || !form.display_name || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(identities ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.email}</TableCell>
                  <TableCell>{i.display_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {i.allowed_roles.map((r) => (
                        <Badge key={r} variant="secondary">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={i.active ? "success" : "outline"}>
                      {i.active ? "active" : "disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toggleMutation.mutate({ id: i.id, active: !i.active })
                      }
                    >
                      {i.active ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

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
      <h1>Admin</h1>
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People & roles</TabsTrigger>
          <TabsTrigger value="identities">Email identities</TabsTrigger>
          <TabsTrigger value="settings">Company settings</TabsTrigger>
        </TabsList>

        <TabsContent value="identities">
          <EmailIdentitiesTab />
        </TabsContent>

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
                      ["tagline", "Tagline (invoice header)"],
                      ["address", "Address"],
                      ["tin", "TIN"],
                      ["registration_no", "Registration No."],
                      ["base_currency", "Base currency"],
                      ["invoice_prefix", "Invoice prefix"],
                      ["credit_note_prefix", "Credit note prefix"],
                      ["invoice_intro", "Invoice intro line"],
                      ["payment_instructions", "Payment method text"],
                      ["vat_note", "VAT note"],
                      ["contact_note", "Contact note"],
                      ["issuer_name", "Issuer name"],
                      ["issuer_title", "Issuer title"],
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
