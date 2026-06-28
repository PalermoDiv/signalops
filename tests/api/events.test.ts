import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import { auth } from "@/lib/auth";

async function authRequest(
  path: string,
  method: string,
  body: object,
  cookie?: string
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);

  const request = new Request(`http://localhost:3000/api/auth${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  const response = await auth.handler(request);
  const setCookie = response.headers.get("set-cookie") || undefined;
  const responseBody = response.status === 204 ? null : await response.json();

  return { response, body: responseBody, setCookie };
}

function extractSessionToken(setCookie?: string): string | undefined {
  if (!setCookie) return undefined;
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1];
}

async function createAuthenticatedUser() {
  const timestamp = Date.now();
  const email = `test-${timestamp}@example.com`;
  const password = "password123";
  const name = "Test User";

  const signUp = await authRequest("/sign-up/email", "POST", {
    email,
    password,
    name,
  });

  expect(signUp.response.status).toBe(200);
  const token = extractSessionToken(signUp.setCookie);
  if (!token) {
    throw new Error("Sign up failed: no session cookie returned");
  }

  const cookie = `better-auth.session_token=${token}`;

  const createOrg = await authRequest(
    "/organization/create",
    "POST",
    {
      name: "Test Organization",
      slug: `test-org-${timestamp}`,
    },
    cookie
  );

  expect(createOrg.response.status).toBe(200);

  const setActive = await authRequest(
    "/organization/set-active",
    "POST",
    {
      organizationId: createOrg.body.id,
    },
    cookie
  );

  expect(setActive.response.status).toBe(200);

  return {
    token,
    organizationId: createOrg.body.id as string,
    userId: signUp.body.user.id as string,
  };
}

async function createMachine(organizationId: string) {
  return prisma.machine.create({
    data: {
      organizationId,
      name: "Test Machine",
      location: "Building 1",
    },
  });
}

function createRequest(body: object, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.cookie = `better-auth.session_token=${token}`;
  }

  return new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/events", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates a valid event and returns 201", async () => {
    const { token, organizationId } = await createAuthenticatedUser();
    const machine = await createMachine(organizationId);

    const request = createRequest(
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

    const request = createRequest(
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
    const request = createRequest({
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

    const request = createRequest(
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

    const request = createRequest(
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
    const { token, organizationId } = await createAuthenticatedUser();

    // Create a machine in a different organization
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

    const request = createRequest(
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
});
