import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns healthy when critical databases are reachable", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.oltp.healthy).toBe(true);
    expect(body.checks.olap.healthy).toBe(true);
    expect(body.checks.redis.healthy).toBe(true);
  });
});
