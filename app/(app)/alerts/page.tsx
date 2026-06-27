import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Alerts — SignalOps",
};

export default function AlertsPage() {
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
          <CardDescription>Unresolved issues across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <p className="text-sm">Alert engine coming in M4.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
