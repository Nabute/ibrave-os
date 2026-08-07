import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type AppRole, type EmailTemplate } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";

const DEPARTMENTS: {
  key: EmailTemplate["department"];
  label: string;
  blurb: string;
  editRole: AppRole;
}[] = [
  { key: "finance", label: "Finance", blurb: "Invoice delivery and the dunning ladder", editRole: "finance" },
  { key: "sales", label: "Sales", blurb: "Prospect outreach and proposal follow-ups", editRole: "sales" },
  { key: "talent", label: "Recruiting", blurb: "Candidate outreach and interview invitations", editRole: "recruiter" },
  { key: "general", label: "General (IT admin)", blurb: "Calendar invites and system mail", editRole: "admin" },
];

/**
 * Department-scoped email template editor. Everyone can read (the composer
 * offers templates to all senders); editing is enforced by RLS per
 * department — the UI mirrors that so buttons match reality.
 */
export function TemplatesScreen() {
  const api = useApi();
  const { hasRole } = useSession();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => api.comms.templates(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1>Email templates</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The standard letters the system and the composer send. Each department
          edits its own; <span className="font-mono text-[13px]">{"{{placeholders}}"}</span> are
          filled automatically at send time.
        </p>
      </div>

      {DEPARTMENTS.map((dept) => {
        const rows = (templates ?? []).filter((t) => t.department === dept.key);
        if (rows.length === 0) return null;
        const canEdit = hasRole(dept.editRole);
        return (
          <Card key={dept.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {dept.label}
                {!canEdit && (
                  <Badge variant="outline" className="ml-2 align-middle">read-only for you</Badge>
                )}
              </CardTitle>
              <CardDescription>{dept.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {rows.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/70">Subject:</span> {t.subject}
                    </p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {t.body}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    title={canEdit ? undefined : `Editable by ${dept.editRole} or admin`}
                    onClick={() => setEditing(t)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {editing && (
        <EditTemplateDialog template={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditTemplateDialog({
  template,
  onClose,
}: {
  template: EmailTemplate;
  onClose: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: template.name,
    subject: template.subject,
    body: template.body,
  });

  const saveMutation = useMutation({
    mutationFn: () => api.comms.updateTemplate(template.id, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-templates"] });
      onClose();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  const insertVar = (v: string) =>
    setForm((f) => ({ ...f, body: `${f.body}{{${v}}}` }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit template — {template.name}</DialogTitle>
          <DialogDescription>
            Blank line = new paragraph. Placeholders are replaced with real
            values at send time; the branded header, details block and footer
            are added automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea
              rows={9}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          {template.variables.length > 0 && (
            <div className="space-y-1">
              <Label>Available placeholders (click to insert)</Label>
              <div className="flex flex-wrap gap-1.5">
                {template.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors hover:bg-accent"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            disabled={!form.name.trim() || !form.subject.trim() || !form.body.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
