import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ensureOlapSchema,
  refreshOlapAggregates,
} from "@/lib/olap";

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

  return NextResponse.json({ ok: true });
}
