import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentOrganization } from "@/lib/organization";
import { getOpenAlerts } from "@/lib/operations";

export const metadata = {
  title: "Alerts — SignalOps",
};

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const organization = await getCurrentOrganization();
  const alerts = await getOpenAlerts(organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground">
          Operational issues that need attention.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open Alerts</CardTitle>
          <CardDescription>
            {alerts.length} unresolved issue{alerts.length === 1 ? "" : "s"} across{" "}
            {organization.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <p className="text-sm">No open alerts. Event rules will create them automatically.</p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {alerts.map((alert) => (
                <li key={alert.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{alert.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {alert.machine?.name ?? "Organization-wide"} ·{" "}
                        {alert.type} · {alert.createdAt.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={severityVariant(alert.severity)}>
                      {alert.severity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function severityVariant(
  severity: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "CRITICAL":
      return "destructive";
    case "HIGH":
      return "destructive";
    case "MEDIUM":
      return "default";
    case "LOW":
      return "secondary";
    default:
      return "outline";
  }
}
