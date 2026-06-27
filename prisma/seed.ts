import { seedDatabase, disconnectSeedClient } from "@/lib/seed";

async function main() {
  const { org, machine } = await seedDatabase();
  console.log("Seeded:", { org: org.name, machine: machine.name });
}

main()
  .then(async () => {
    await disconnectSeedClient();
  })
  .catch(async (e) => {
    console.error(e);
    await disconnectSeedClient();
    process.exit(1);
  });
