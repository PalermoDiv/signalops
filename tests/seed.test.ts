import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "@/tests/setup";
import { seedDatabase } from "@/lib/seed";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates the demo organization and machine", async () => {
    await seedDatabase();

    const org = await prisma.organization.findUnique({
      where: { id: "00000000-0000-0000-0000-000000000001" },
    });

    const machine = await prisma.machine.findUnique({
      where: { id: "00000000-0000-0000-0000-000000000002" },
    });

    expect(org).not.toBeNull();
    expect(org?.name).toBe("Acme Manufacturing");
    expect(machine).not.toBeNull();
    expect(machine?.name).toBe("Assembly Line A");
  });

  it("is idempotent", async () => {
    await seedDatabase();
    await seedDatabase();
    await seedDatabase();

    const orgCount = await prisma.organization.count();
    const machineCount = await prisma.machine.count();

    expect(orgCount).toBe(1);
    expect(machineCount).toBe(1);
  });
});
