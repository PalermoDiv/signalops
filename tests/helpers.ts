import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function authRequest(
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

export function extractSessionToken(setCookie?: string): string | undefined {
  if (!setCookie) return undefined;
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1];
}

export async function createAuthenticatedUser() {
  const timestamp = Date.now();
  const email = `test-${timestamp}@example.com`;
  const password = "password123";
  const name = "Test User";

  const signUp = await authRequest("/sign-up/email", "POST", {
    email,
    password,
    name,
  });

  if (signUp.response.status !== 200) {
    throw new Error(`Sign up failed: ${signUp.response.status}`);
  }

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

  if (createOrg.response.status !== 200) {
    throw new Error(`Organization creation failed: ${createOrg.response.status}`);
  }

  const setActive = await authRequest(
    "/organization/set-active",
    "POST",
    {
      organizationId: createOrg.body.id,
    },
    cookie
  );

  if (setActive.response.status !== 200) {
    throw new Error(`Set active organization failed: ${setActive.response.status}`);
  }

  return {
    token,
    organizationId: createOrg.body.id as string,
    userId: signUp.body.user.id as string,
  };
}

export async function createMachine(organizationId: string, name?: string) {
  return prisma.machine.create({
    data: {
      organizationId,
      name: name ?? "Test Machine",
      location: "Building 1",
    },
  });
}

export function createEventRequest(body: object, token?: string) {
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
