import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Dashboard — SignalOps",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations Overview</h1>
        <p className="text-muted-foreground">
          Real-time status of your manufacturing floor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Active Machines" value="—" description="Coming in M4" />
        <MetricCard title="Machines Online" value="—" description="Coming in M4" />
        <MetricCard title="Production Today" value="—" description="Coming in M4" />
        <MetricCard title="Open Alerts" value="—" description="Coming in M4" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Machine Utilization</CardTitle>
            <CardDescription>Planned vs actual runtime</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <Badge variant="secondary">M4</Badge>
              <p className="mt-2 text-sm">Analytics will appear here.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Alerts</CardTitle>
            <CardDescription>Requires immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <Badge variant="secondary">M4</Badge>
              <p className="mt-2 text-sm">Alert engine coming soon.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
