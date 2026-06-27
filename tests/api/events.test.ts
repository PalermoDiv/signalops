import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const MACHINE_ID = "00000000-0000-0000-0000-000000000002";

async function seedDemoData() {
  await prisma.organization.create({
    data: { id: ORG_ID, name: "Acme Manufacturing" },
  });

  await prisma.machine.create({
    data: {
      id: MACHINE_ID,
      organizationId: ORG_ID,
      name: "Assembly Line A",
      location: "Building 1",
    },
  });
}

describe("POST /api/events", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedDemoData();
  });

  it("creates a valid event and returns 201", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        machineId: MACHINE_ID,
        type: "MACHINE_STARTED",
        payload: { temperature: 82 },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.type).toBe("MACHINE_STARTED");
    expect(body.organizationId).toBe(ORG_ID);
    expect(body.machineId).toBe(MACHINE_ID);
    expect(body.payload).toEqual({ temperature: 82 });
    expect(body.id).toBeDefined();
    expect(body.occurredAt).toBeDefined();

    const saved = await prisma.event.findUnique({ where: { id: body.id } });
    expect(saved).not.toBeNull();
    expect(saved?.type).toBe("MACHINE_STARTED");
  });

  it("defaults payload to an empty object when omitted", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        machineId: MACHINE_ID,
        type: "MACHINE_STOPPED",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.payload).toEqual({});
  });

  it("rejects a request without organizationId", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId: MACHINE_ID,
        type: "MACHINE_STARTED",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("organizationId is required");
  });

  it("rejects a request without machineId", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        type: "MACHINE_STARTED",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("machineId is required");
  });

  it("rejects an invalid event type", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        machineId: MACHINE_ID,
        type: "INVALID_TYPE",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("type must be one of");
  });

  it("rejects an event with a non-existent machine", async () => {
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        machineId: "99999999-9999-9999-9999-999999999999",
        type: "MACHINE_STARTED",
      }),
    });

    await expect(POST(request)).rejects.toThrow();
  });
});
