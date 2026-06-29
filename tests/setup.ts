import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { execSync } from "child_process";
import {
  ensureOlapSchema,
  olapPool,
  resetOlapTables,
} from "@/lib/olap";

const rawTestUrl =
  process.env.TEST_DATABASE_URL ?? deriveTestUrl(process.env.DATABASE_URL);

const rawOlapTestUrl =
  process.env.TEST_OLAP_DATABASE_URL ??
  deriveTestUrl(process.env.OLAP_DATABASE_URL);

if (!rawTestUrl) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set to run tests."
  );
}

if (!rawOlapTestUrl) {
  throw new Error(
    "TEST_OLAP_DATABASE_URL or OLAP_DATABASE_URL must be set to run tests."
  );
}

// Point Prisma at the test database for the rest of the process.
process.env.DATABASE_URL = rawTestUrl;
process.env.OLAP_DATABASE_URL = rawOlapTestUrl;

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

async function ensureTestDatabaseExists(databaseUrl: string) {
  const { host, port, user, password, database } =
    parsePostgresUrl(databaseUrl);

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
    `TRUNCATE TABLE "user", session, account, verification, organization, member, invitation, machines, events, alerts RESTART IDENTITY CASCADE;`
  );
  await resetOlapTables();
}

beforeAll(async () => {
  await ensureTestDatabaseExists(rawTestUrl);
  runMigrations();
  await ensureTestDatabaseExists(rawOlapTestUrl);
  await ensureOlapSchema();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
  await olapPool.end();
});
