import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedDatabase() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Acme Manufacturing",
      slug: "acme-manufacturing",
    },
  });

  const machine = await prisma.machine.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      organizationId: org.id,
      name: "Assembly Line A",
      location: "Building 1",
    },
  });

  return { org, machine };
}

export async function disconnectSeedClient() {
  await prisma.$disconnect();
}
