import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";

const EVENT_TYPES: EventType[] = [
  "MACHINE_STARTED",
  "MACHINE_STOPPED",
  "MACHINE_ERROR",
  "TEMPERATURE_RECORDED",
  "PRODUCTION_COMPLETED",
];

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.organizationId || typeof body.organizationId !== "string") {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 }
    );
  }

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

  const event = await prisma.event.create({
    data: {
      organizationId: body.organizationId,
      machineId: body.machineId,
      type: body.type,
      payload: body.payload ?? {},
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    },
  });

  return NextResponse.json(event, { status: 201 });
}
