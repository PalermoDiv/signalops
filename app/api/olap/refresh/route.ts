import { NextResponse } from "next/server";
import { metrics } from "@opentelemetry/api";
import { auth } from "@/lib/auth";
import {
  ensureOlapSchema,
  refreshOlapAggregates,
} from "@/lib/olap";

const meter = metrics.getMeter("signalops");
const reportRefreshesCounter = meter.createCounter(
  "signalops.reports.refreshes.total",
  { description: "Total number of report refreshes" }
);

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    return NextResponse.json(
      { error: "No active organization" },
      { status: 403 }
    );
  }

  // ponytail: ensure schema exists on first refresh. In production this belongs in a migration.
  await ensureOlapSchema();
  await refreshOlapAggregates(organizationId);

  reportRefreshesCounter.add(1, {
    organization_id: organizationId,
  });

  return NextResponse.json({ ok: true });
}
