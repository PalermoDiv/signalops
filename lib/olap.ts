import { Pool } from "pg";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, invalidatePattern } from "@/lib/redis";

const connectionString =
  process.env.OLAP_DATABASE_URL ??
  "postgresql://signalops:signalops@localhost:5435/signalops_olap";

export const olapPool = new Pool({ connectionString });

const REPORT_CACHE_TTL_SECONDS = 5 * 60;

function reportCacheKey(
  organizationId: string,
  type: "daily" | "weekly" | "monthly",
  period: number
) {
  return `reports:${organizationId}:${type}:${period}`;
}

export async function invalidateReportsCache(organizationId: string) {
  await invalidatePattern(`reports:${organizationId}:*`);
}

export async function ensureOlapSchema() {
  await olapPool.query(`
    CREATE TABLE IF NOT EXISTS daily_production (
      date DATE NOT NULL,
      organization_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      total_units INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, organization_id, machine_id)
    );

    CREATE TABLE IF NOT EXISTS daily_downtime (
      date DATE NOT NULL,
      organization_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      total_minutes INTEGER NOT NULL DEFAULT 0,
      incident_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, organization_id, machine_id)
    );

    CREATE TABLE IF NOT EXISTS daily_errors (
      date DATE NOT NULL,
      organization_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      error_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, organization_id, machine_id)
    );
  `);
}

export async function resetOlapTables() {
  await olapPool.query(`
    TRUNCATE TABLE daily_production, daily_downtime, daily_errors RESTART IDENTITY;
  `);
}

export async function refreshOlapAggregates(organizationId: string) {
  await Promise.all([
    refreshDailyProduction(organizationId),
    refreshDailyDowntime(organizationId),
    refreshDailyErrors(organizationId),
  ]);
}

async function refreshDailyProduction(organizationId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ date: string; machine_id: string; total_units: number }>
  >`
    SELECT
      DATE(occurred_at)::text AS date,
      machine_id,
      COUNT(*)::int AS total_units
    FROM events
    WHERE organization_id = ${organizationId}
      AND type = 'PRODUCTION_COMPLETED'
    GROUP BY DATE(occurred_at), machine_id
  `;

  const client = await olapPool.connect();
  try {
    // ponytail: row-by-row upsert is fine while event volume is low.
    for (const row of rows) {
      await client.query(
        `
          INSERT INTO daily_production (date, organization_id, machine_id, total_units)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (date, organization_id, machine_id)
          DO UPDATE SET total_units = EXCLUDED.total_units
        `,
        [row.date, organizationId, row.machine_id, row.total_units]
      );
    }
  } finally {
    client.release();
  }
}

async function refreshDailyDowntime(organizationId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      date: string;
      machine_id: string;
      total_minutes: number;
      incident_count: number;
    }>
  >`
    WITH stop_events AS (
      SELECT id, machine_id, occurred_at
      FROM events
      WHERE type = 'MACHINE_STOPPED'
        AND organization_id = ${organizationId}
    ),
    next_start AS (
      SELECT
        s.machine_id,
        s.occurred_at AS stopped_at,
        MIN(e.occurred_at) AS started_at
      FROM stop_events s
      JOIN events e
        ON e.machine_id = s.machine_id
        AND e.type = 'MACHINE_STARTED'
        AND e.occurred_at > s.occurred_at
      GROUP BY s.machine_id, s.occurred_at
    )
    SELECT
      DATE(stopped_at)::text AS date,
      machine_id,
      SUM(EXTRACT(EPOCH FROM (started_at - stopped_at)) / 60)::int AS total_minutes,
      COUNT(*)::int AS incident_count
    FROM next_start
    GROUP BY DATE(stopped_at), machine_id
  `;

  const client = await olapPool.connect();
  try {
    for (const row of rows) {
      await client.query(
        `
          INSERT INTO daily_downtime (date, organization_id, machine_id, total_minutes, incident_count)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date, organization_id, machine_id)
          DO UPDATE SET
            total_minutes = EXCLUDED.total_minutes,
            incident_count = EXCLUDED.incident_count
        `,
        [
          row.date,
          organizationId,
          row.machine_id,
          row.total_minutes,
          row.incident_count,
        ]
      );
    }
  } finally {
    client.release();
  }
}

async function refreshDailyErrors(organizationId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ date: string; machine_id: string; error_count: number }>
  >`
    SELECT
      DATE(occurred_at)::text AS date,
      machine_id,
      COUNT(*)::int AS error_count
    FROM events
    WHERE organization_id = ${organizationId}
      AND type = 'MACHINE_ERROR'
    GROUP BY DATE(occurred_at), machine_id
  `;

  const client = await olapPool.connect();
  try {
    for (const row of rows) {
      await client.query(
        `
          INSERT INTO daily_errors (date, organization_id, machine_id, error_count)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (date, organization_id, machine_id)
          DO UPDATE SET error_count = EXCLUDED.error_count
        `,
        [row.date, organizationId, row.machine_id, row.error_count]
      );
    }
  } finally {
    client.release();
  }
}

function parseDate(dateText: string): Date {
  // Parse as UTC midnight to avoid timezone shifts between OLTP and OLAP.
  return new Date(`${dateText}T00:00:00Z`);
}

export async function getDailyReport(organizationId: string, days = 14) {
  const cacheKey = reportCacheKey(organizationId, "daily", days);
  const cached = await getCached<DailyReportRow[]>(cacheKey);
  if (cached) return cached.map((row) => ({ ...row, date: parseDate(row.date) }));

  const result = await queryDailyReport(organizationId, days);
  await setCached(cacheKey, result, REPORT_CACHE_TTL_SECONDS);
  return result.map((row) => ({ ...row, date: parseDate(row.date) }));
}

type DailyReportRow = {
  date: string;
  totalUnits: number;
  totalDowntimeMinutes: number;
  downtimeIncidents: number;
  errorCount: number;
};

async function queryDailyReport(
  organizationId: string,
  days: number
): Promise<DailyReportRow[]> {
  const { rows } = await olapPool.query(
    `
      SELECT
        p.date::text AS date_text,
        COALESCE(SUM(p2.total_units), 0) AS total_units,
        COALESCE(SUM(d.total_minutes), 0) AS total_downtime_minutes,
        COALESCE(SUM(d.incident_count), 0) AS downtime_incidents,
        COALESCE(SUM(e.error_count), 0) AS error_count
      FROM (
        SELECT generate_series(
          CURRENT_DATE - ($2 || ' days')::interval,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ) p
      LEFT JOIN daily_production p2
        ON p2.date = p.date AND p2.organization_id = $1
      LEFT JOIN daily_downtime d
        ON d.date = p.date AND d.organization_id = $1
      LEFT JOIN daily_errors e
        ON e.date = p.date AND e.organization_id = $1
      GROUP BY p.date
      ORDER BY p.date DESC
    `,
    [organizationId, days - 1]
  );

  return rows.map((row) => ({
    date: row.date_text as string,
    totalUnits: Number(row.total_units),
    totalDowntimeMinutes: Number(row.total_downtime_minutes),
    downtimeIncidents: Number(row.downtime_incidents),
    errorCount: Number(row.error_count),
  }));
}

export async function getWeeklyReport(organizationId: string, weeks = 8) {
  const cacheKey = reportCacheKey(organizationId, "weekly", weeks);
  const cached = await getCached<WeeklyReportRow[]>(cacheKey);
  if (cached) return cached.map((row) => ({ ...row, week: parseDate(row.week) }));

  const result = await queryWeeklyReport(organizationId, weeks);
  await setCached(cacheKey, result, REPORT_CACHE_TTL_SECONDS);
  return result.map((row) => ({ ...row, week: parseDate(row.week) }));
}

type WeeklyReportRow = {
  week: string;
  totalUnits: number;
  totalDowntimeMinutes: number;
  downtimeIncidents: number;
  errorCount: number;
};

async function queryWeeklyReport(
  organizationId: string,
  weeks: number
): Promise<WeeklyReportRow[]> {
  const { rows } = await olapPool.query(
    `
      SELECT
        g.week_start::text AS week_text,
        COALESCE(SUM(p2.total_units), 0) AS total_units,
        COALESCE(SUM(d.total_minutes), 0) AS total_downtime_minutes,
        COALESCE(SUM(d.incident_count), 0) AS downtime_incidents,
        COALESCE(SUM(e.error_count), 0) AS error_count
      FROM (
        SELECT generate_series(
          DATE_TRUNC('week', CURRENT_DATE) - (($2 - 1) || ' weeks')::interval,
          DATE_TRUNC('week', CURRENT_DATE),
          '1 week'::interval
        )::date AS week_start
      ) g
      CROSS JOIN LATERAL generate_series(g.week_start, g.week_start + '6 days'::interval, '1 day'::interval) AS p(date)
      LEFT JOIN daily_production p2
        ON p2.date = p.date AND p2.organization_id = $1
      LEFT JOIN daily_downtime d
        ON d.date = p.date AND d.organization_id = $1
      LEFT JOIN daily_errors e
        ON e.date = p.date AND e.organization_id = $1
      GROUP BY g.week_start
      ORDER BY g.week_start DESC
    `,
    [organizationId, weeks]
  );

  return rows.map((row) => ({
    week: row.week_text as string,
    totalUnits: Number(row.total_units),
    totalDowntimeMinutes: Number(row.total_downtime_minutes),
    downtimeIncidents: Number(row.downtime_incidents),
    errorCount: Number(row.error_count),
  }));
}

export async function getMonthlyReport(organizationId: string, months = 6) {
  const cacheKey = reportCacheKey(organizationId, "monthly", months);
  const cached = await getCached<MonthlyReportRow[]>(cacheKey);
  if (cached)
    return cached.map((row) => ({ ...row, month: parseDate(row.month) }));

  const result = await queryMonthlyReport(organizationId, months);
  await setCached(cacheKey, result, REPORT_CACHE_TTL_SECONDS);
  return result.map((row) => ({ ...row, month: parseDate(row.month) }));
}

type MonthlyReportRow = {
  month: string;
  totalUnits: number;
  totalDowntimeMinutes: number;
  downtimeIncidents: number;
  errorCount: number;
};

async function queryMonthlyReport(
  organizationId: string,
  months: number
): Promise<MonthlyReportRow[]> {
  const { rows } = await olapPool.query(
    `
      SELECT
        g.month_start::text AS month_text,
        COALESCE(SUM(p2.total_units), 0) AS total_units,
        COALESCE(SUM(d.total_minutes), 0) AS total_downtime_minutes,
        COALESCE(SUM(d.incident_count), 0) AS downtime_incidents,
        COALESCE(SUM(e.error_count), 0) AS error_count
      FROM (
        SELECT generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - (($2 - 1) || ' months')::interval,
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'::interval
        )::date AS month_start
      ) g
      CROSS JOIN LATERAL generate_series(g.month_start, (g.month_start + '1 month'::interval - '1 day'::interval)::date, '1 day'::interval) AS p(date)
      LEFT JOIN daily_production p2
        ON p2.date = p.date AND p2.organization_id = $1
      LEFT JOIN daily_downtime d
        ON d.date = p.date AND d.organization_id = $1
      LEFT JOIN daily_errors e
        ON e.date = p.date AND e.organization_id = $1
      GROUP BY g.month_start
      ORDER BY g.month_start DESC
    `,
    [organizationId, months]
  );

  return rows.map((row) => ({
    month: row.month_text as string,
    totalUnits: Number(row.total_units),
    totalDowntimeMinutes: Number(row.total_downtime_minutes),
    downtimeIncidents: Number(row.downtime_incidents),
    errorCount: Number(row.error_count),
  }));
}
