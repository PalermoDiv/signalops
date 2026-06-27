import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { execSync } from "child_process";

const rawTestUrl =
  process.env.TEST_DATABASE_URL ?? deriveTestUrl(process.env.DATABASE_URL);

if (!rawTestUrl) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set to run tests."
  );
}

// Point Prisma at the test database for the rest of the process.
process.env.DATABASE_URL = rawTestUrl;

export const prisma = new PrismaClient();

function deriveTestUrl(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  return databaseUrl.replace(/\/[^/]+$/, "/signalops_test");
}

function parsePostgresUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
  };
}

async function ensureTestDatabaseExists() {
  const { host, port, user, password, database } = parsePostgresUrl(rawTestUrl);

  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: "postgres",
  });

  await adminClient.connect();

  const result = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [database]
  );

  if (result.rowCount === 0) {
    try {
      await adminClient.query(`CREATE DATABASE "${database}"`);
    } catch (error) {
      // 42P04 = duplicate_database. Another worker may have created it.
      if ((error as { code?: string }).code !== "42P04") {
        throw error;
      }
    }
  }

  await adminClient.end();
}

function runMigrations() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: rawTestUrl },
  });
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE organizations, machines, events, alerts RESTART IDENTITY CASCADE;`
  );
}

beforeAll(async () => {
  await ensureTestDatabaseExists();
  runMigrations();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
