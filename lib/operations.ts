import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  EventType,
  MachineStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const OVERHEAT_THRESHOLD = 80;
const OVERHEAT_CRITICAL_THRESHOLD = 90;
const ERRORS_PER_HOUR_THRESHOLD = 3;
const DOWNTIME_MINUTES_THRESHOLD = 30;
const DOWNTIME_CRITICAL_MINUTES_THRESHOLD = 120;

export async function updateMachineStatusFromEvent(
  machineId: string,
  eventType: EventType
) {
  const statusByEvent: Record<EventType, MachineStatus | null> = {
    MACHINE_STARTED: MachineStatus.RUNNING,
    MACHINE_STOPPED: MachineStatus.OFFLINE,
    MACHINE_ERROR: MachineStatus.ERROR,
    TEMPERATURE_RECORDED: null,
    PRODUCTION_COMPLETED: null,
  };

  const status = statusByEvent[eventType];
  if (!status) return;

  await prisma.machine.update({
    where: { id: machineId },
    data: { status },
  });
}

export async function evaluateAlertRules(
  organizationId: string,
  machineId: string,
  eventType: EventType,
  payload: Prisma.JsonValue,
  occurredAt: Date
) {
  await evaluateOverheatingRule(organizationId, machineId, eventType, payload);
  await evaluateHighErrorRateRule(
    organizationId,
    machineId,
    eventType,
    occurredAt
  );
  await evaluateExcessiveDowntimeRule(
    organizationId,
    machineId,
    eventType,
    occurredAt
  );
}

async function evaluateOverheatingRule(
  organizationId: string,
  machineId: string,
  eventType: EventType,
  payload: Prisma.JsonValue
) {
  if (eventType !== EventType.TEMPERATURE_RECORDED) return;

  const temperature =
    typeof payload === "object" &&
    payload !== null &&
    "temperature" in payload &&
    typeof payload.temperature === "number"
      ? payload.temperature
      : null;

  if (temperature === null || temperature <= OVERHEAT_THRESHOLD) return;

  const existing = await prisma.alert.findFirst({
    where: {
      organizationId,
      machineId,
      type: AlertType.MACHINE_OVERHEATING,
      status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
    },
  });

  if (existing) return;

  await prisma.alert.create({
    data: {
      organizationId,
      machineId,
      type: AlertType.MACHINE_OVERHEATING,
      severity:
        temperature > OVERHEAT_CRITICAL_THRESHOLD
          ? AlertSeverity.CRITICAL
          : AlertSeverity.HIGH,
      message: `Machine temperature ${temperature}°C exceeds ${OVERHEAT_THRESHOLD}°C threshold`,
    },
  });
}

async function evaluateHighErrorRateRule(
  organizationId: string,
  machineId: string,
  eventType: EventType,
  occurredAt: Date
) {
  if (eventType !== EventType.MACHINE_ERROR) return;

  const oneHourAgo = new Date(occurredAt.getTime() - 60 * 60 * 1000);
  const errorCount = await prisma.event.count({
    where: {
      organizationId,
      machineId,
      type: EventType.MACHINE_ERROR,
      occurredAt: { gte: oneHourAgo },
    },
  });

  if (errorCount < ERRORS_PER_HOUR_THRESHOLD) return;

  const existing = await prisma.alert.findFirst({
    where: {
      organizationId,
      machineId,
      type: AlertType.HIGH_ERROR_RATE,
      status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
    },
  });

  if (existing) return;

  await prisma.alert.create({
    data: {
      organizationId,
      machineId,
      type: AlertType.HIGH_ERROR_RATE,
      severity: AlertSeverity.HIGH,
      message: `Machine reported ${errorCount} errors in the last hour`,
    },
  });
}

async function evaluateExcessiveDowntimeRule(
  organizationId: string,
  machineId: string,
  eventType: EventType,
  occurredAt: Date
) {
  if (eventType !== EventType.MACHINE_STARTED) return;

  const lastStop = await prisma.event.findFirst({
    where: {
      organizationId,
      machineId,
      type: EventType.MACHINE_STOPPED,
      occurredAt: { lt: occurredAt },
    },
    orderBy: { occurredAt: "desc" },
  });

  if (!lastStop) return;

  const downtimeMinutes =
    (occurredAt.getTime() - lastStop.occurredAt.getTime()) / 60_000;

  if (downtimeMinutes <= DOWNTIME_MINUTES_THRESHOLD) return;

  await prisma.alert.create({
    data: {
      organizationId,
      machineId,
      type: AlertType.EXCESSIVE_DOWNTIME,
      severity:
        downtimeMinutes > DOWNTIME_CRITICAL_MINUTES_THRESHOLD
          ? AlertSeverity.CRITICAL
          : AlertSeverity.MEDIUM,
      message: `Machine was down for ${Math.round(downtimeMinutes)} minutes`,
    },
  });
}

export async function getDashboardMetrics(organizationId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalMachines,
    activeMachines,
    onlineMachines,
    productionToday,
    openAlerts,
  ] = await Promise.all([
    prisma.machine.count({ where: { organizationId } }),
    prisma.machine.count({
      where: { organizationId, status: MachineStatus.RUNNING },
    }),
    prisma.machine.count({
      where: { organizationId, status: { not: MachineStatus.OFFLINE } },
    }),
    prisma.event.count({
      where: {
        organizationId,
        type: EventType.PRODUCTION_COMPLETED,
        occurredAt: { gte: startOfDay },
      },
    }),
    prisma.alert.count({
      where: {
        organizationId,
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
      },
    }),
  ]);

  const utilization =
    totalMachines > 0
      ? Math.round((activeMachines / totalMachines) * 100)
      : 0;

  return {
    totalMachines,
    activeMachines,
    onlineMachines,
    productionToday,
    openAlerts,
    utilization,
  };
}

export async function getProductionTrends(organizationId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const events = await prisma.event.findMany({
    where: {
      organizationId,
      type: EventType.PRODUCTION_COMPLETED,
      occurredAt: { gte: startOfDay },
    },
    select: { occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return hours.map((hour) => ({
    hour,
    label: `${hour.toString().padStart(2, "0")}:00`,
    count: events.filter((event) => event.occurredAt.getHours() === hour).length,
  }));
}

export async function getAverageDowntimeMinutes(organizationId: string) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stopEvents = await prisma.event.findMany({
    where: {
      organizationId,
      type: EventType.MACHINE_STOPPED,
      occurredAt: { gte: oneDayAgo },
    },
    select: { machineId: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  let totalMinutes = 0;
  let incidentCount = 0;

  for (const stop of stopEvents) {
    const nextStart = await prisma.event.findFirst({
      where: {
        organizationId,
        machineId: stop.machineId,
        type: EventType.MACHINE_STARTED,
        occurredAt: { gt: stop.occurredAt },
      },
      orderBy: { occurredAt: "asc" },
    });

    if (!nextStart) continue;

    totalMinutes +=
      (nextStart.occurredAt.getTime() - stop.occurredAt.getTime()) / 60_000;
    incidentCount++;
  }

  return incidentCount > 0 ? Math.round(totalMinutes / incidentCount) : 0;
}

export async function getMachines(organizationId: string) {
  const machines = await prisma.machine.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  const lastEvents = await prisma.event.findMany({
    where: { organizationId },
    distinct: ["machineId"],
    orderBy: { occurredAt: "desc" },
    select: { machineId: true, type: true, occurredAt: true },
  });

  const lastEventByMachine = new Map(
    lastEvents.map((event) => [event.machineId, event])
  );

  return machines.map((machine) => ({
    ...machine,
    lastEvent: lastEventByMachine.get(machine.id) ?? null,
  }));
}

export async function getOpenAlerts(organizationId: string) {
  return prisma.alert.findMany({
    where: {
      organizationId,
      status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
    },
    orderBy: { createdAt: "desc" },
    include: { machine: { select: { name: true } } },
  });
}

export function statusVariant(
  status: MachineStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case MachineStatus.RUNNING:
      return "default";
    case MachineStatus.ONLINE:
      return "default";
    case MachineStatus.ERROR:
      return "destructive";
    case MachineStatus.OFFLINE:
      return "secondary";
    default:
      return "outline";
  }
}
