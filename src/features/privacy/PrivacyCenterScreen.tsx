import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Send } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { toDisplayMessage, type PrivacyRequestType } from "@/lib/api";
import { useApi } from "@/lib/session";

const REQUEST_TYPES: { value: PrivacyRequestType; label: string }[] = [
  { value: "access", label: "Access" },
  { value: "portability", label: "Portability" },
  { value: "rectification", label: "Rectification" },
  { value: "erasure", label: "Erasure" },
  { value: "restriction", label: "Restriction" },
  { value: "objection", label: "Objection" },
  { value: "other", label: "Other" },
];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PrivacyCenterScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["privacy-requests"],
    queryFn: () => api.privacy.requests(),
  });
  const { data: policies } = useQuery({
    queryKey: ["privacy-retention-policies"],
    queryFn: () => api.privacy.retentionPolicies(),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.privacy.submitRequest(requestType, details),
    onSuccess: () => {
      setDetails("");
      setMessage("Request submitted.");
      void qc.invalidateQueries({ queryKey: ["privacy-requests"] });
    },
    onError: (e) => setMessage(toDisplayMessage(e)),
  });

  const exportMutation = useMutation({
    mutationFn: () => api.privacy.exportMine(),
    onSuccess: (data) => {
      downloadJson(`ibrave-os-privacy-export-${new Date().toISOString().slice(0, 10)}.json`, data);
    },
    onError: (e) => setMessage(toDisplayMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Privacy Center</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Review the data areas this workspace uses and submit privacy rights requests.
          </p>
        </div>
        <Button variant="outline" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
          <Download className="h-4 w-4" /> Export my data
        </Button>
      </div>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Submit a request</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label>Request type</Label>
            <Select value={requestType} onValueChange={(v) => setRequestType(v as PrivacyRequestType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Details</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the records or correction you need."
            />
          </div>
          <Button
            disabled={details.trim().length < 10 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="h-4 w-4" /> Submit
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">My requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Response</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.request_type}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "fulfilled" ? "success" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(r.due_at).toLocaleDateString()}</TableCell>
                  <TableCell className="max-w-xl text-muted-foreground">
                    {r.response_note ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Retention policy</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data area</TableHead>
                <TableHead>Lawful basis</TableHead>
                <TableHead>Months</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(policies ?? []).map((p) => (
                <TableRow key={p.data_area}>
                  <TableCell className="font-medium">{p.data_area}</TableCell>
                  <TableCell>{p.lawful_basis}</TableCell>
                  <TableCell>{p.default_retention_months}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.review_action}</Badge>
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
