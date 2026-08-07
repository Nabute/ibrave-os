import type { AppRole } from "@/lib/api";

interface RouteRule {
  prefix: string;
  roles: AppRole[];
  ownerOnly?: boolean;
}

const ROUTE_RULES: RouteRule[] = [
  { prefix: "/command-center", roles: ["owner"], ownerOnly: true },
  { prefix: "/approvals", roles: ["pm"] },
  { prefix: "/projects", roles: ["pm", "finance"] },
  { prefix: "/clients", roles: ["finance", "sales", "account_owner", "pm"] },
  { prefix: "/invoices", roles: ["finance"] },
  { prefix: "/payouts", roles: ["finance"] },
  { prefix: "/reports", roles: ["pm", "finance"] },
  { prefix: "/staffing", roles: ["resourcing", "pm", "finance"] },
  { prefix: "/people", roles: ["resourcing", "pm", "finance", "recruiter"] },
  { prefix: "/recruiting", roles: ["recruiter"] },
  { prefix: "/prospecting", roles: ["sales"] },
  { prefix: "/sales", roles: ["sales", "finance"] },
  { prefix: "/templates", roles: ["finance", "sales", "recruiter", "admin"] },
  { prefix: "/admin", roles: ["admin"] },
];

function hasRole(roles: AppRole[], role: AppRole): boolean {
  if (role === "owner") return roles.includes("owner");
  if (role === "admin") return roles.includes("admin") || roles.includes("owner");
  return roles.includes(role) || roles.includes("owner") || roles.includes("admin");
}

export function canAccessPath(pathname: string, roles: AppRole[]): boolean {
  const rule = ROUTE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );
  if (!rule) return true;
  if (rule.ownerOnly) return roles.includes("owner");
  return rule.roles.some((role) => hasRole(roles, role));
}
