import { NextResponse } from "next/server";
import { metrics } from "@opentelemetry/api";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { EventType } from "@prisma/client";
import {
  evaluateAlertRules,
  updateMachineStatusFromEvent,
} from "@/lib/operations";

const meter = metrics.getMeter("signalops");
const eventsIngestedCounter = meter.createCounter(
  "signalops.events.ingested.total",
  { description: "Total number of events ingested" }
);

const EVENT_TYPES: EventType[] = [
  "MACHINE_STARTED",
  "MACHINE_STOPPED",
  "MACHINE_ERROR",
  "TEMPERATURE_RECORDED",
  "PRODUCTION_COMPLETED",
];

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

  const body = await request.json();

  if (!body.machineId || typeof body.machineId !== "string") {
    return NextResponse.json(
      { error: "machineId is required" },
      { status: 400 }
    );
  }

  if (!body.type || !EVENT_TYPES.includes(body.type)) {
    return NextResponse.json(
      { error: `type must be one of ${EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // ponytail: verify the machine belongs to the user's active organization.
  const machine = await prisma.machine.findFirst({
    where: {
      id: body.machineId,
      organizationId,
    },
  });

  if (!machine) {
    return NextResponse.json(
      { error: "Machine not found in your organization" },
      { status: 404 }
    );
  }

  const event = await prisma.event.create({
    data: {
      organizationId,
      machineId: body.machineId,
      type: body.type,
      payload: body.payload ?? {},
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    },
  });

  // ponytail: evaluate rules synchronously so the dashboard reflects changes immediately.
  // Move to async worker when event volume or rule complexity grows.
  await updateMachineStatusFromEvent(event.machineId, event.type);
  await evaluateAlertRules(
    event.organizationId,
    event.machineId,
    event.type,
    event.payload,
    event.occurredAt
  );

  eventsIngestedCounter.add(1, {
    "event.type": event.type,
    "organization.id": event.organizationId,
  });

  return NextResponse.json(event, { status: 201 });
}
