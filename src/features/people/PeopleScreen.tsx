import { useQuery } from "@tanstack/react-query";
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

/** Who do we have — the entry point into every person's Talent 360. */
export function PeopleScreen() {
  const api = useApi();
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.talent.people(),
  });
  const { data: skills } = useQuery({
    queryKey: ["person-skills-all"],
    queryFn: () => api.staffing.personSkills(),
  });

  const skillsByUser = new Map<string, string[]>();
  for (const s of skills ?? []) {
    skillsByUser.set(s.user_id, [
      ...(skillsByUser.get(s.user_id) ?? []),
      s.skills?.name ?? "",
    ]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>People</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Who we have, what they've done, and who can be placed tomorrow — one search
          away.
        </p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Skills</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(people ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      to="/people/$personId"
                      params={{ personId: p.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.title ?? "—"}</TableCell>
                  <TableCell>{p.employment_type}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(skillsByUser.get(p.id) ?? []).map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
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
