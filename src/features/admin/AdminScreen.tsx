import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BulkActionBar, RowCheckbox, TableToolbar } from "@/components/TableToolbar";
import { useTableControls } from "@/lib/useTableControls";
import { useUrlTab } from "@/lib/useUrlTab";
import { TableSkeleton } from "@/components/Skeletons";
import { Copy, KeyRound, Pencil, UserRoundPlus } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type AppRole, type PrivacyRequestStatus, type Profile } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";

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
                placeholder="ibrave Talent"
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

const PRIVACY_STATUSES: PrivacyRequestStatus[] = [
  "open",
  "in_review",
  "fulfilled",
  "rejected",
  "withdrawn",
];

function PrivacyRequestsTab() {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: requests } = useQuery({
    queryKey: ["admin-privacy-requests"],
    queryFn: () => api.admin.privacyRequests(),
  });
  const { data: retentionDue } = useQuery({
    queryKey: ["admin-privacy-retention-due"],
    queryFn: () => api.admin.privacyRetentionDue(),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      response_note,
    }: {
      id: string;
      status?: PrivacyRequestStatus;
      response_note?: string | null;
    }) => api.admin.updatePrivacyRequest(id, { status, response_note }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin-privacy-requests"] });
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const retentionItems = retentionDue
    ? Object.entries(retentionDue).filter(([k]) => k !== "generated_at" && k !== "error")
    : [];

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Retention review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {retentionItems.map(([key, value]) => (
              <div key={key} className="rounded-md border p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">{key}</p>
                <p className="num mt-1 text-2xl font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Privacy requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requester</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Response note</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.requester_email}</TableCell>
                  <TableCell>{r.request_type}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(status) =>
                        updateMutation.mutate({
                          id: r.id,
                          status: status as PrivacyRequestStatus,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIVACY_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{new Date(r.due_at).toLocaleDateString()}</TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">{r.details}</TableCell>
                  <TableCell className="min-w-64">
                    <Textarea
                      value={notes[r.id] ?? r.response_note ?? ""}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        updateMutation.mutate({
                          id: r.id,
                          response_note: notes[r.id] ?? r.response_note ?? null,
                        })
                      }
                    >
                      Save note
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

function SecurityEventsTab() {
  const api = useApi();
  const { data: events } = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: () => api.admin.securityEvents(),
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Security events</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Recent access denials and security-relevant events for admin review.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(events ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      e.severity === "critical" || e.severity === "high"
                        ? "destructive"
                        : e.severity === "medium"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {e.severity}
                  </Badge>
                </TableCell>
                <TableCell>{e.source}</TableCell>
                <TableCell className="font-medium">{e.event_type}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.actor_id ?? "-"}
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                  {JSON.stringify(e.detail)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useUrlTab("people");
  const api = useApi();
  const qc = useQueryClient();
  const { userId } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, AppRole | "">>({});
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [tempPassword, setTempPassword] = useState<{ label: string; value: string } | null>(
    null
  );

  const { data: people, isLoading: peopleLoading } = useQuery({
    queryKey: ["admin-people"],
    queryFn: () => api.admin.people(),
  });
  const controls = useTableControls(people ?? [], {
    getId: (p) => p.id,
    haystack: (p) => `${p.full_name} ${p.email} ${p.title ?? ""} ${p.user_roles.map((r) => r.role).join(" ")}`,
    facets: [
      { key: "employment_type", label: "Type", get: (p) => p.employment_type },
      {
        key: "active",
        label: "Status",
        get: (p) => (p.active ? "active" : "deactivated"),
        options: [
          { value: "active", label: "active" },
          { value: "deactivated", label: "deactivated" },
        ],
      },
    ],
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
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.admin.setUserActive(id, active),
    onSuccess: invalidatePeople,
    onError: (e) => setError(toDisplayMessage(e)),
  });
  const resetMutation = useMutation({
    mutationFn: (p: Profile) => api.admin.resetPassword(p.id),
    onSuccess: (r, p) =>
      setTempPassword({ label: `New password for ${p.full_name}`, value: r.temp_password }),
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
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="people">People & roles</TabsTrigger>
          <TabsTrigger value="identities">Email identities</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="settings">Company settings</TabsTrigger>
        </TabsList>

        <TabsContent value="identities">
          <EmailIdentitiesTab />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacyRequestsTab />
        </TabsContent>

        <TabsContent value="security">
          <SecurityEventsTab />
        </TabsContent>

        <TabsContent value="people">
          <Card>
            <CardContent className="pt-4">
              <div className="mb-3 flex justify-end">
                <Button onClick={() => setShowInvite(true)}>
                  <UserRoundPlus className="h-4 w-4" /> Add person
                </Button>
              </div>
              {peopleLoading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : (
              <>
              <TableToolbar
                query={controls.query}
                onQuery={controls.setQuery}
                facets={controls.facets}
                count={controls.rows.length}
                total={(people ?? []).length}
                placeholder="Search name, email, role"
              />
              <BulkActionBar
                count={controls.selection.count}
                onClear={controls.selection.clear}
                noun="person"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={activeMutation.isPending}
                  onClick={() => {
                    controls.selection.rows
                      .filter((p) => p.active && p.id !== userId)
                      .forEach((p) => activeMutation.mutate({ id: p.id, active: false }));
                    controls.selection.clear();
                  }}
                >
                  Deactivate selected
                </Button>
              </BulkActionBar>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <RowCheckbox
                        checked={controls.selection.allVisible}
                        onChange={controls.selection.toggleAll}
                        label="Select all people"
                      />
                    </TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-56">Grant role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controls.rows.map((p) => (
                    <TableRow
                      key={p.id}
                      className={`${p.active ? "" : "opacity-60"} ${controls.selection.has(p.id) ? "bg-brass/5 shadow-[inset_2px_0_0_0_hsl(var(--brass))]" : ""}`}
                    >
                      <TableCell className="w-8">
                        <RowCheckbox
                          checked={controls.selection.has(p.id)}
                          onChange={() => controls.selection.toggle(p.id)}
                          label={`Select ${p.full_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.full_name}
                        {p.title && (
                          <span className="ml-2 text-xs text-muted-foreground">{p.title}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell>{p.employment_type}</TableCell>
                      <TableCell>
                        <Badge variant={p.active ? "success" : "outline"}>
                          {p.active ? "active" : "deactivated"}
                        </Badge>
                      </TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit profile"
                            onClick={() => setEditing(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Reset password"
                            disabled={resetMutation.isPending}
                            onClick={() => resetMutation.mutate(p)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={p.active ? "text-destructive" : ""}
                            disabled={activeMutation.isPending || p.id === userId}
                            title={
                              p.id === userId
                                ? "You cannot deactivate yourself"
                                : p.active
                                  ? "Deactivate (blocks sign-in)"
                                  : "Reactivate"
                            }
                            onClick={() =>
                              activeMutation.mutate({ id: p.id, active: !p.active })
                            }
                          >
                            {p.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </>
              )}
            </CardContent>
          </Card>

          <InvitePersonDialog
            open={showInvite}
            onClose={() => setShowInvite(false)}
            onInvited={(fullName, password) => {
              setShowInvite(false);
              invalidatePeople();
              setTempPassword({ label: `Temporary password for ${fullName}`, value: password });
            }}
          />
          {editing && (
            <EditPersonDialog
              person={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                invalidatePeople();
              }}
            />
          )}
          <TempPasswordDialog
            info={tempPassword}
            onClose={() => setTempPassword(null)}
          />
        </TabsContent>

        <TabsContent value="settings">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Security, two-factor authentication</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                MFA is off by default. Pick the roles for which it is mandatory, anyone
                holding one of them must enroll an authenticator app at next sign-in.
                Individual people can also be mandated from the People tab (edit ✎).
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((r) => {
                  const current = settings?.mfa_required_roles ?? [];
                  const on = current.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={settingsMutation.isPending}
                      onClick={() =>
                        settingsMutation.mutate({
                          mfa_required_roles: on
                            ? current.filter((x) => x !== r)
                            : [...current, r],
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {on ? "✓ " : ""}{r}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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

/** Create the auth user + profile + roles; shows the one-time temp password. */
function InvitePersonDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (fullName: string, tempPassword: string) => void;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    title: "",
    employment_type: "employee" as "employee" | "contractor",
    roles: ["employee"] as AppRole[],
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.admin.inviteUser({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        title: form.title.trim() || undefined,
        employment_type: form.employment_type,
        roles: form.roles,
      }),
    onSuccess: (r) => {
      setError(null);
      const name = form.full_name;
      setForm({
        email: "",
        full_name: "",
        title: "",
        employment_type: "employee",
        roles: ["employee"],
      });
      onInvited(name, r.temp_password);
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>
            Creates the account immediately. You hand over the temporary password
            yourself, it is shown once and never emailed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={form.title}
              placeholder="Developer"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={form.employment_type}
              onValueChange={(v) =>
                setForm({ ...form, employment_type: v as "employee" | "contractor" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">employee</SelectItem>
                <SelectItem value="contractor">contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES.map((r) => {
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
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={
              !form.email.trim() ||
              !form.full_name.trim() ||
              form.roles.length === 0 ||
              inviteMutation.isPending
            }
            onClick={() => inviteMutation.mutate()}
          >
            {inviteMutation.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPersonDialog({
  person,
  onClose,
  onSaved,
}: {
  person: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: person.full_name,
    title: person.title ?? "",
    employment_type: person.employment_type,
    weekly_capacity_hours: String(person.weekly_capacity_hours),
    mfa_required: person.mfa_required ?? false,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.admin.updatePerson(person.id, {
        full_name: form.full_name.trim(),
        title: form.title.trim() || null,
        employment_type: form.employment_type,
        weekly_capacity_hours: Number(form.weekly_capacity_hours) || 40,
        mfa_required: form.mfa_required,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {person.full_name}</DialogTitle>
          <DialogDescription>{person.email}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Full name</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={form.employment_type}
              onValueChange={(v) =>
                setForm({ ...form, employment_type: v as "employee" | "contractor" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">employee</SelectItem>
                <SelectItem value="contractor">contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Weekly capacity (h)</Label>
            <Input
              inputMode="decimal"
              value={form.weekly_capacity_hours}
              onChange={(e) =>
                setForm({ ...form, weekly_capacity_hours: e.target.value })
              }
            />
          </div>
          <label className="col-span-2 flex cursor-pointer items-center justify-between gap-4 rounded-md border px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Require MFA</span>
              <span className="block text-xs text-muted-foreground">
                Must enroll an authenticator app at next sign-in (role-wide
                mandates live in Company settings)
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--brass))]"
              checked={form.mfa_required}
              onChange={(e) => setForm({ ...form, mfa_required: e.target.checked })}
            />
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={!form.full_name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One-time reveal of a generated password, with copy. */
function TempPasswordDialog({
  info,
  onClose,
}: {
  info: { label: string; value: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{info?.label}</DialogTitle>
          <DialogDescription>
            Share it over a secure channel; it won't be shown again. The person
            should change it under Preferences after first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
            {info?.value}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (info) void navigator.clipboard.writeText(info.value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
