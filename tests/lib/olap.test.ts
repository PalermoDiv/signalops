import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import { createAuthenticatedUser, createMachine } from "@/tests/helpers";
import {
  getDailyReport,
  getMonthlyReport,
  getWeeklyReport,
  refreshOlapAggregates,
} from "@/lib/olap";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe("OLAP aggregates", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("aggregates daily production from PRODUCTION_COMPLETED events", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);
    const today = new Date();

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: today,
      },
    });
    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: today,
      },
    });

    await refreshOlapAggregates(organizationId);

    const report = await getDailyReport(organizationId, 1);
    const todayRow = report.find((row) => dateKey(row.date) === dateKey(today));

    expect(todayRow?.totalUnits).toBe(2);
  });

  it("aggregates daily downtime from stop-start pairs", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);
    const today = new Date();

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "MACHINE_STOPPED",
        payload: {},
        occurredAt: new Date(today.getTime() - 60 * 60 * 1000),
      },
    });
    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "MACHINE_STARTED",
        payload: {},
        occurredAt: today,
      },
    });

    await refreshOlapAggregates(organizationId);

    const report = await getDailyReport(organizationId, 1);
    const todayRow = report.find((row) => dateKey(row.date) === dateKey(today));

    expect(todayRow?.totalDowntimeMinutes).toBe(60);
    expect(todayRow?.downtimeIncidents).toBe(1);
  });

  it("aggregates daily errors", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);
    const today = new Date();

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "MACHINE_ERROR",
        payload: {},
        occurredAt: today,
      },
    });
    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "MACHINE_ERROR",
        payload: {},
        occurredAt: today,
      },
    });

    await refreshOlapAggregates(organizationId);

    const report = await getDailyReport(organizationId, 1);
    const todayRow = report.find((row) => dateKey(row.date) === dateKey(today));

    expect(todayRow?.errorCount).toBe(2);
  });

  it("does not include data from other organizations", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const otherOrg = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Other Org",
        slug: `other-org-${Date.now()}`,
      },
    });
    const machine = await createMachine(organizationId);
    const otherMachine = await prisma.machine.create({
      data: { organizationId: otherOrg.id, name: "Other Machine" },
    });

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: new Date(),
      },
    });
    await prisma.event.create({
      data: {
        organizationId: otherOrg.id,
        machineId: otherMachine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: new Date(),
      },
    });

    await refreshOlapAggregates(organizationId);

    const report = await getDailyReport(organizationId, 1);
    const totalUnits = report.reduce((sum, row) => sum + row.totalUnits, 0);
    expect(totalUnits).toBe(1);
  });

  it("rolls daily data up into weekly reports", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);
    const now = new Date();
    const thisWeek = new Date(
      now.getTime() - (now.getDay() || 7) * 24 * 60 * 60 * 1000
    );

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: new Date(thisWeek.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: new Date(thisWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    await refreshOlapAggregates(organizationId);

    const weekly = await getWeeklyReport(organizationId, 4);
    const activeWeeks = weekly.filter((row) => row.totalUnits > 0);

    expect(activeWeeks).toHaveLength(1);
    expect(activeWeeks[0].totalUnits).toBe(2);
  });

  it("rolls daily data up into monthly reports", async () => {
    const { organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 2);

    await prisma.event.create({
      data: {
        organizationId,
        machineId: machine.id,
        type: "PRODUCTION_COMPLETED",
        payload: {},
        occurredAt: thisMonth,
      },
    });

    await refreshOlapAggregates(organizationId);

    const monthly = await getMonthlyReport(organizationId, 3);
    const activeMonths = monthly.filter((row) => row.totalUnits > 0);

    expect(activeMonths).toHaveLength(1);
    expect(activeMonths[0].totalUnits).toBe(1);
  });
});
