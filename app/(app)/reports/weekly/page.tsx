import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentOrganization } from "@/lib/organization";
import { getWeeklyReport } from "@/lib/olap";
import { RefreshButton } from "../refresh-button";
import { ReportTabs } from "../report-tabs";

export const metadata = {
  title: "Weekly Report — SignalOps",
};

export const dynamic = "force-dynamic";

export default async function WeeklyReportPage() {
  const organization = await getCurrentOrganization();
  const rows = await getWeeklyReport(organization.id, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Report</h1>
          <p className="text-muted-foreground">
            Last 8 weeks of production, downtime, and errors.
          </p>
        </div>
        <RefreshButton />
      </div>

      <ReportTabs active="weekly" />

      <Card>
        <CardHeader>
          <CardTitle>Weekly Summary</CardTitle>
          <CardDescription>
            Aggregated from the OLAP database for {organization.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
              <p className="text-sm">No data yet. Click refresh to populate.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Week</th>
                    <th className="pb-2 font-medium">Production</th>
                    <th className="pb-2 font-medium">Downtime</th>
                    <th className="pb-2 font-medium">Incidents</th>
                    <th className="pb-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.week.toISOString()} className="border-b">
                      <td className="py-3">
                        {row.week.toLocaleDateString()} —{" "}
                        {new Date(
                          row.week.getTime() + 6 * 24 * 60 * 60 * 1000
                        ).toLocaleDateString()}
                      </td>
                      <td className="py-3">{row.totalUnits}</td>
                      <td className="py-3">
                        {row.totalDowntimeMinutes > 0
                          ? `${row.totalDowntimeMinutes} min`
                          : "—"}
                      </td>
                      <td className="py-3">
                        {row.downtimeIncidents > 0 ? (
                          <Badge variant="secondary">
                            {row.downtimeIncidents}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3">
                        {row.errorCount > 0 ? (
                          <Badge variant="destructive">{row.errorCount}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
