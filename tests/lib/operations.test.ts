import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import { createAuthenticatedUser, createMachine } from "@/tests/helpers";
import {
  evaluateAlertRules,
  getAverageDowntimeMinutes,
  getDashboardMetrics,
  getMachines,
  getOpenAlerts,
  getProductionTrends,
  updateMachineStatusFromEvent,
} from "@/lib/operations";

async function createEvent(
  organizationId: string,
  machineId: string,
  type: string,
  payload: object = {},
  occurredAt?: Date
) {
  return prisma.event.create({
    data: {
      organizationId,
      machineId,
      type: type as Parameters<typeof evaluateAlertRules>[2],
      payload,
      occurredAt: occurredAt ?? new Date(),
    },
  });
}

describe("operations library", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("updateMachineStatusFromEvent", () => {
    it("sets status to RUNNING on MACHINE_STARTED", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await updateMachineStatusFromEvent(machine.id, "MACHINE_STARTED");

      const updated = await prisma.machine.findUnique({
        where: { id: machine.id },
      });
      expect(updated?.status).toBe("RUNNING");
    });

    it("sets status to OFFLINE on MACHINE_STOPPED", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await updateMachineStatusFromEvent(machine.id, "MACHINE_STOPPED");

      const updated = await prisma.machine.findUnique({
        where: { id: machine.id },
      });
      expect(updated?.status).toBe("OFFLINE");
    });

    it("does not change status for temperature events", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await updateMachineStatusFromEvent(machine.id, "TEMPERATURE_RECORDED");

      const updated = await prisma.machine.findUnique({
        where: { id: machine.id },
      });
      expect(updated?.status).toBe("OFFLINE");
    });
  });

  describe("evaluateAlertRules", () => {
    it("creates an overheating alert above the threshold", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await evaluateAlertRules(
        organizationId,
        machine.id,
        "TEMPERATURE_RECORDED",
        { temperature: 85 },
        new Date()
      );

      const alerts = await prisma.alert.findMany({
        where: { organizationId },
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("MACHINE_OVERHEATING");
      expect(alerts[0].severity).toBe("HIGH");
    });

    it("does not duplicate open overheating alerts", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await evaluateAlertRules(
        organizationId,
        machine.id,
        "TEMPERATURE_RECORDED",
        { temperature: 85 },
        new Date()
      );
      await evaluateAlertRules(
        organizationId,
        machine.id,
        "TEMPERATURE_RECORDED",
        { temperature: 86 },
        new Date()
      );

      const alerts = await prisma.alert.count({
        where: { organizationId, type: "MACHINE_OVERHEATING" },
      });
      expect(alerts).toBe(1);
    });

    it("creates a high error rate alert after three errors in an hour", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const now = new Date();

      await createEvent(organizationId, machine.id, "MACHINE_ERROR", {}, now);
      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_ERROR",
        {},
        new Date(now.getTime() + 1_000)
      );
      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_ERROR",
        {},
        new Date(now.getTime() + 2_000)
      );
      await evaluateAlertRules(
        organizationId,
        machine.id,
        "MACHINE_ERROR",
        {},
        new Date(now.getTime() + 2_000)
      );

      const alerts = await prisma.alert.findMany({
        where: { organizationId },
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("HIGH_ERROR_RATE");
    });

    it("creates an excessive downtime alert after a long stop", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const stoppedAt = new Date(Date.now() - 60 * 60 * 1000);

      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STOPPED",
        {},
        stoppedAt
      );
      await evaluateAlertRules(
        organizationId,
        machine.id,
        "MACHINE_STARTED",
        {},
        new Date()
      );

      const alerts = await prisma.alert.findMany({
        where: { organizationId },
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("EXCESSIVE_DOWNTIME");
    });

    it("does not create a downtime alert for short stops", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const stoppedAt = new Date(Date.now() - 5 * 60 * 1000);

      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STOPPED",
        {},
        stoppedAt
      );
      await evaluateAlertRules(
        organizationId,
        machine.id,
        "MACHINE_STARTED",
        {},
        new Date()
      );

      const alerts = await prisma.alert.count({
        where: { organizationId },
      });
      expect(alerts).toBe(0);
    });
  });

  describe("getDashboardMetrics", () => {
    it("returns zeroed metrics for an empty organization", async () => {
      const { organizationId } = await createAuthenticatedUser();

      const metrics = await getDashboardMetrics(organizationId);

      expect(metrics).toEqual({
        totalMachines: 0,
        activeMachines: 0,
        onlineMachines: 0,
        productionToday: 0,
        openAlerts: 0,
        utilization: 0,
      });
    });

    it("counts running machines as active and online", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      await prisma.machine.update({
        where: { id: machine.id },
        data: { status: "RUNNING" },
      });

      const metrics = await getDashboardMetrics(organizationId);

      expect(metrics.totalMachines).toBe(1);
      expect(metrics.activeMachines).toBe(1);
      expect(metrics.onlineMachines).toBe(1);
      expect(metrics.utilization).toBe(100);
    });

    it("counts production events from today only", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      await createEvent(
        organizationId,
        machine.id,
        "PRODUCTION_COMPLETED",
        {},
        today
      );
      await createEvent(
        organizationId,
        machine.id,
        "PRODUCTION_COMPLETED",
        {},
        yesterday
      );

      const metrics = await getDashboardMetrics(organizationId);
      expect(metrics.productionToday).toBe(1);
    });
  });

  describe("getProductionTrends", () => {
    it("groups today's production by hour", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const now = new Date();

      await createEvent(
        organizationId,
        machine.id,
        "PRODUCTION_COMPLETED",
        {},
        now
      );
      await createEvent(
        organizationId,
        machine.id,
        "PRODUCTION_COMPLETED",
        {},
        now
      );

      const trends = await getProductionTrends(organizationId);
      const currentHour = trends.find((t) => t.hour === now.getHours());
      expect(currentHour?.count).toBe(2);
      const otherHour = trends.find((t) => t.hour === (now.getHours() + 1) % 24);
      expect(otherHour?.count).toBe(0);
    });
  });

  describe("getAverageDowntimeMinutes", () => {
    it("computes the average downtime for completed stop-start cycles", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      const now = new Date();

      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STOPPED",
        {},
        new Date(now.getTime() - 90 * 60 * 1000)
      );
      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STARTED",
        {},
        new Date(now.getTime() - 60 * 60 * 1000)
      );
      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STOPPED",
        {},
        new Date(now.getTime() - 30 * 60 * 1000)
      );
      await createEvent(organizationId, machine.id, "MACHINE_STARTED", {}, now);

      const average = await getAverageDowntimeMinutes(organizationId);
      expect(average).toBe(30);
    });

    it("returns zero when there are no completed downtime incidents", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STOPPED",
        {},
        new Date()
      );

      const average = await getAverageDowntimeMinutes(organizationId);
      expect(average).toBe(0);
    });
  });

  describe("getMachines", () => {
    it("includes the last event for each machine", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);
      await createEvent(
        organizationId,
        machine.id,
        "MACHINE_STARTED",
        {},
        new Date()
      );

      const machines = await getMachines(organizationId);

      expect(machines).toHaveLength(1);
      expect(machines[0].lastEvent?.type).toBe("MACHINE_STARTED");
    });

    it("does not include machines from other organizations", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const otherOrg = await prisma.organization.create({
        data: {
          id: crypto.randomUUID(),
          name: "Other Org",
          slug: `other-org-${Date.now()}`,
        },
      });
      await createMachine(organizationId);
      await prisma.machine.create({
        data: { organizationId: otherOrg.id, name: "Other Machine" },
      });

      const machines = await getMachines(organizationId);
      expect(machines).toHaveLength(1);
      expect(machines[0].organizationId).toBe(organizationId);
    });
  });

  describe("getOpenAlerts", () => {
    it("only returns open or acknowledged alerts", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await prisma.alert.create({
        data: {
          organizationId,
          machineId: machine.id,
          type: "MACHINE_OVERHEATING",
          severity: "HIGH",
          message: "Hot",
          status: "OPEN",
        },
      });
      await prisma.alert.create({
        data: {
          organizationId,
          machineId: machine.id,
          type: "HIGH_ERROR_RATE",
          severity: "HIGH",
          message: "Errors",
          status: "RESOLVED",
        },
      });

      const alerts = await getOpenAlerts(organizationId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("MACHINE_OVERHEATING");
    });
  });
});
