import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import { createAuthenticatedUser, createMachine } from "@/tests/helpers";
import { parseEvent, processEvent } from "@/lib/worker";

describe("worker", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("parseEvent", () => {
    it("extracts the inserted row from a Debezium create envelope", () => {
      const envelope = {
        payload: {
          op: "c",
          after: {
            id: "evt-1",
            organization_id: "org-1",
            machine_id: "machine-1",
            type: "MACHINE_STARTED",
            payload: { temperature: 82 },
            occurred_at: "2026-06-29T00:00:00Z",
          },
        },
      };

      const parsed = parseEvent(envelope);

      expect(parsed).toEqual(envelope.payload.after);
    });

    it("returns null for non-create operations", () => {
      const envelope = {
        payload: {
          op: "u",
          after: { id: "evt-1" },
        },
      };

      expect(parseEvent(envelope)).toBeNull();
    });

    it("returns null for malformed messages", () => {
      expect(parseEvent("not json")).toBeNull();
      expect(parseEvent({ payload: { op: "c" } })).toBeNull();
      expect(parseEvent(null)).toBeNull();
    });
  });

  describe("processEvent", () => {
    it("updates machine status and creates alerts asynchronously", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await processEvent({
        id: "evt-1",
        organization_id: organizationId,
        machine_id: machine.id,
        type: "MACHINE_STARTED",
        payload: {},
        occurred_at: new Date().toISOString(),
      });

      const updated = await prisma.machine.findUnique({
        where: { id: machine.id },
      });
      expect(updated?.status).toBe("RUNNING");
    });

    it("creates an overheating alert from a temperature event", async () => {
      const { organizationId } = await createAuthenticatedUser();
      const machine = await createMachine(organizationId);

      await processEvent({
        id: "evt-2",
        organization_id: organizationId,
        machine_id: machine.id,
        type: "TEMPERATURE_RECORDED",
        payload: { temperature: 95 },
        occurred_at: new Date().toISOString(),
      });

      const alerts = await prisma.alert.findMany({
        where: { organizationId, machineId: machine.id },
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("MACHINE_OVERHEATING");
    });
  });
});
