import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

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
import { useApi, useSession } from "@/lib/session";

export function ProjectDetailScreen() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const api = useApi();
  const { hasRole } = useSession();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId),
  });
  const { data: tasks } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: () => api.projects.tasks(projectId),
  });
  const { data: members } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => api.projects.members(projectId),
  });
  const { data: rateCards } = useQuery({
    queryKey: ["project-rates", projectId, project?.client_id],
    queryFn: () => api.projects.rateCards(projectId, project!.client_id),
    enabled: !!project && hasRole("finance"),
  });

  if (!project) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1>{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {project.clients?.name} · {project.billing_model.toUpperCase()} ·{" "}
          <Badge variant={project.status === "active" ? "success" : "secondary"}>
            {project.status}
          </Badge>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Team</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Allocation</TableHead>
                  <TableHead>From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.profiles?.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.role_on_project ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{m.allocation_pct}%</TableCell>
                    <TableCell>{m.start_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {(tasks ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span>{t.name}</span>
                  <Badge variant={t.billable ? "success" : "secondary"}>
                    {t.billable ? "billable" : "non-billable"}
                  </Badge>
                </li>
              ))}
              {(tasks ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No task list — entries log directly to the project.
                </p>
              )}
            </ul>
          </CardContent>
        </Card>

        {hasRole("finance") && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Rate cards (versioned)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(rateCards ?? []).map((card) => (
                <div key={card.id}>
                  <p className="mb-1 text-sm font-medium">
                    Effective {card.effective_from}
                    <span className="ml-2 text-muted-foreground">
                      {card.project_id ? "project card" : "client default"}
                      {card.note && ` · ${card.note}`}
                    </span>
                  </p>
                  <Table>
                    <TableBody>
                      {(card.rate_card_lines ?? []).map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            {line.profiles?.full_name ?? line.role_name}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {line.user_id ? "(person)" : "(role)"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMinor(line.hourly_rate_minor, project.clients?.currency ?? "USD")}/h
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              {(rateCards ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No rate card yet — configure one on the client before invoicing.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
