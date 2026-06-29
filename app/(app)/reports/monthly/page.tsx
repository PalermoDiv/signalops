import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentOrganization } from "@/lib/organization";
import { getMonthlyReport } from "@/lib/olap";
import { RefreshButton } from "../refresh-button";
import { ReportTabs } from "../report-tabs";

export const metadata = {
  title: "Monthly Report — SignalOps",
};

export const dynamic = "force-dynamic";

export default async function MonthlyReportPage() {
  const organization = await getCurrentOrganization();
  const rows = await getMonthlyReport(organization.id, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Report</h1>
          <p className="text-muted-foreground">
            Last 6 months of production, downtime, and errors.
          </p>
        </div>
        <RefreshButton />
      </div>

      <ReportTabs active="monthly" />

      <Card>
        <CardHeader>
          <CardTitle>Monthly Summary</CardTitle>
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
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium">Production</th>
                    <th className="pb-2 font-medium">Downtime</th>
                    <th className="pb-2 font-medium">Incidents</th>
                    <th className="pb-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month.toISOString()} className="border-b">
                      <td className="py-3">
                        {row.month.toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
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
