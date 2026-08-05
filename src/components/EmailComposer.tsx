import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toDisplayMessage, type SendEmailPayload } from "@/lib/api";
import { useApi } from "@/lib/session";

interface EmailComposerProps {
  open: boolean;
  onClose: () => void;
  /** Prefills */
  to?: string[];
  subject?: string;
  body?: string;
  /** Entity links — the send is logged into these timelines automatically. */
  related?: Pick<
    SendEmailPayload,
    | "client_id"
    | "lead_id"
    | "prospect_id"
    | "candidate_id"
    | "invoice_id"
    | "attach_invoice_pdf"
    | "event_id"
  >;
  onSent?: () => void;
}

/**
 * The one email dialog the whole app uses. Sends through the send-user-email
 * Edge Function: from the company address, reply-to the sender, logged in
 * email_log, mirrored into the related timeline. Nobody opens an external
 * mail client.
 */
export function EmailComposer({
  open,
  onClose,
  to,
  subject,
  body,
  related,
  onSent,
}: EmailComposerProps) {
  const api = useApi();
  const [form, setForm] = useState({ to: "", cc: "", subject: "", body: "" });
  const [fromEmail, setFromEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: identities } = useQuery({
    queryKey: ["email-identities"],
    queryFn: () => api.comms.myIdentities(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm({
        to: (to ?? []).join(", "),
        cc: "",
        subject: subject ?? "",
        body: body ?? "",
      });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && identities?.length && !fromEmail) {
      setFromEmail(identities[0].email); // personal identity comes first
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identities]);

  const sendMutation = useMutation({
    mutationFn: () => {
      const toList = form.to.split(/[,;\s]+/).filter(Boolean);
      if (toList.length === 0) throw new Error("At least one recipient required");
      const html = form.body
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
      const identity = (identities ?? []).find((i) => i.email === fromEmail);
      return api.comms.sendEmail({
        to: toList,
        cc: form.cc.split(/[,;\s]+/).filter(Boolean),
        subject: form.subject,
        html,
        from_email: fromEmail || undefined,
        from_name: identity?.display_name,
        ...related,
      });
    },
    onSuccess: () => {
      onSent?.();
      onClose();
    },
    onError: (e) => setError(toDisplayMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Send email
          </DialogTitle>
          <DialogDescription>
            Logged to the record's timeline. Department addresses reply to you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>From</Label>
            <Select value={fromEmail} onValueChange={setFromEmail}>
              <SelectTrigger>
                <SelectValue placeholder="Choose sender…" />
              </SelectTrigger>
              <SelectContent>
                {(identities ?? []).map((i) => (
                  <SelectItem key={i.email} value={i.email}>
                    {i.display_name} &lt;{i.email}&gt;
                    {i.kind === "department" ? " · department" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              placeholder="name@client.com, other@client.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Cc</Label>
            <Input
              value={form.cc}
              onChange={(e) => setForm({ ...form, cc: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Message</Label>
            <Textarea
              rows={8}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          {related?.attach_invoice_pdf && (
            <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
              The invoice PDF is generated server-side and attached automatically.
            </p>
          )}
          {related?.event_id && (
            <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
              A calendar invite (.ics) is attached automatically.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!form.to || !form.subject || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
