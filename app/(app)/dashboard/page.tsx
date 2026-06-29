import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentOrganization } from "@/lib/organization";
import {
  getDashboardMetrics,
  getOpenAlerts,
  getProductionTrends,
  getAverageDowntimeMinutes,
} from "@/lib/operations";
import { Activity, AlertTriangle, Factory, Package } from "lucide-react";

export const metadata = {
  title: "Dashboard — SignalOps",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const organization = await getCurrentOrganization();
  const metrics = await getDashboardMetrics(organization.id);
  const trends = await getProductionTrends(organization.id);
  const alerts = await getOpenAlerts(organization.id);
  const averageDowntime = await getAverageDowntimeMinutes(organization.id);

  const maxProduction = Math.max(...trends.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations Overview</h1>
        <p className="text-muted-foreground">
          Real-time status of {organization.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Machines"
          value={metrics.activeMachines}
          total={metrics.totalMachines}
          icon={<Activity className="size-4" />}
          description="Currently running"
        />
        <MetricCard
          title="Machines Online"
          value={metrics.onlineMachines}
          total={metrics.totalMachines}
          icon={<Factory className="size-4" />}
          description="Connected units"
        />
        <MetricCard
          title="Production Today"
          value={metrics.productionToday}
          icon={<Package className="size-4" />}
          description="Completed units"
        />
        <MetricCard
          title="Open Alerts"
          value={metrics.openAlerts}
          icon={<AlertTriangle className="size-4" />}
          description="Require attention"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Machine Utilization</CardTitle>
            <CardDescription>Active machines vs. total fleet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold">{metrics.utilization}%</span>
              <span className="mb-1 text-sm text-muted-foreground">
                {metrics.activeMachines} of {metrics.totalMachines} machines
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${metrics.utilization}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Average downtime today: {" "}
              {averageDowntime > 0 ? `${averageDowntime} minutes` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
            <CardDescription>Open issues across your organization</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <p className="text-sm">No open alerts.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <li
                    key={alert.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{alert.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {alert.machine?.name ?? "Organization"} ·{" "}
                        {alert.createdAt.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={severityVariant(alert.severity)}>
                      {alert.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Production Trends</CardTitle>
          <CardDescription>Completed units by hour today</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-1">
            {trends.map((trend) => (
              <div
                key={trend.hour}
                className="group relative flex flex-1 flex-col items-center"
              >
                <div
                  className="w-full rounded-sm bg-primary/80 transition-all group-hover:bg-primary"
                  style={{
                    height: `${(trend.count / maxProduction) * 100}%`,
                    minHeight: trend.count > 0 ? "4px" : "0px",
                  }}
                />
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {trend.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  total,
  icon,
  description,
}: {
  title: string;
  value: number;
  total?: number;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <CardTitle className="text-3xl">
          {value}
          {typeof total === "number" && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {total}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
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
