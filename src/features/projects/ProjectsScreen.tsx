import { useQuery } from "@tanstack/react-query";
import { TableSkeleton } from "@/components/Skeletons";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/lib/session";

const MODEL_LABEL = { tm: "T&M", retainer: "Retainer", fixed: "Fixed price" } as const;

export function ProjectsScreen() {
  const api = useApi();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });
  const { data: burn } = useQuery({
    queryKey: ["project-burn"],
    queryFn: () => api.projects.burn(),
  });

  const burnByProject = new Map((burn ?? []).map((b) => [b.project_id, b]));

  return (
    <div className="space-y-4">
      <h1>Projects</h1>
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Approved hours</TableHead>
                <TableHead className="text-right">Burn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(projects ?? []).map((p) => {
                const b = burnByProject.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.code && (
                        <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>
                      )}
                    </TableCell>
                    <TableCell>{p.clients?.name}</TableCell>
                    <TableCell>{MODEL_LABEL[p.billing_model]}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "active"
                            ? "success"
                            : p.status === "paused"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b?.approved_hours ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b?.burn_pct != null ? (
                        <span className={Number(b.burn_pct) >= 90 ? "font-semibold text-destructive" : ""}>
                          {b.burn_pct}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
