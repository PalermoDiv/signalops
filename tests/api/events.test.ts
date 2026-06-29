import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import {
  createAuthenticatedUser,
  createMachine,
  createEventRequest,
} from "@/tests/helpers";

describe("POST /api/events", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates a valid event and returns 201", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const request = createEventRequest(
      {
        machineId: machine.id,
        type: "MACHINE_STARTED",
        payload: { temperature: 82 },
      },
      token
    );

    const response = await POST(request);

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.type).toBe("MACHINE_STARTED");
    expect(body.organizationId).toBe(organizationId);
    expect(body.machineId).toBe(machine.id);
    expect(body.payload).toEqual({ temperature: 82 });
    expect(body.id).toBeDefined();

    const saved = await prisma.event.findUnique({ where: { id: body.id } });
    expect(saved).not.toBeNull();
    expect(saved?.type).toBe("MACHINE_STARTED");
  });

  it("defaults payload to an empty object when omitted", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const request = createEventRequest(
      {
        machineId: machine.id,
        type: "MACHINE_STOPPED",
      },
      token
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.payload).toEqual({});
  });

  it("rejects unauthenticated requests", async () => {
    const request = createEventRequest({
      machineId: "00000000-0000-0000-0000-000000000002",
      type: "MACHINE_STARTED",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects a request without machineId", async () => {
    const { token } = await createAuthenticatedUser();

    const request = createEventRequest(
      {
        type: "MACHINE_STARTED",
      },
      token
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("machineId is required");
  });

  it("rejects an invalid event type", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const request = createEventRequest(
      {
        machineId: machine.id,
        type: "INVALID_TYPE",
      },
      token
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("type must be one of");
  });

  it("rejects an event for a machine outside the user's organization", async () => {
    const { token } = await createAuthenticatedUser();

    const otherOrg = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Other Org",
        slug: `other-org-${Date.now()}`,
      },
    });

    const otherMachine = await prisma.machine.create({
      data: {
        organizationId: otherOrg.id,
        name: "Other Machine",
      },
    });

    const request = createEventRequest(
      {
        machineId: otherMachine.id,
        type: "MACHINE_STARTED",
      },
      token
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Machine not found in your organization");
  });

  it("does not update machine status synchronously", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const response = await POST(
      createEventRequest(
        { machineId: machine.id, type: "MACHINE_STARTED" },
        token
      )
    );
    expect(response.status).toBe(201);

    const unchanged = await prisma.machine.findUnique({
      where: { id: machine.id },
    });
    expect(unchanged?.status).toBe("OFFLINE");
  });

  it("does not create alerts synchronously", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const response = await POST(
      createEventRequest(
        {
          machineId: machine.id,
          type: "TEMPERATURE_RECORDED",
          payload: { temperature: 95 },
        },
        token
      )
    );

    expect(response.status).toBe(201);

    const alerts = await prisma.alert.findMany({
      where: { organizationId, machineId: machine.id },
    });

    expect(alerts).toHaveLength(0);
  });
});
