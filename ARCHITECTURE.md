# SignalOps Architecture Overview

> Current as of Milestones 8 and 12.

---

## System at a glance

SignalOps is a multi-tenant operations intelligence platform. Operational events flow in through a REST API, are stored in an OLTP database, and are propagated through a Kafka stream. Side effects (machine status updates, alerts, cache invalidation) happen asynchronously. Dashboards and reports read from the OLTP database, the OLAP database, and Redis caches.

```
┌─────────────┐     POST /api/events      ┌─────────────────┐
│   Browser   │ ─────────────────────────▶│   Next.js app   │
│  / curl     │                           │  (React + API)  │
└─────────────┘                           └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ PostgreSQL OLTP │
                                          │  events, users, │
                                          │ machines, alerts│
                                          └────────┬────────┘
                                                   │
                              Debezium CDC         │
                              (logical replication)│
                                                   ▼
                                          ┌─────────────────┐
                                          │  Apache Kafka   │
                                          │ KRaft mode      │
                                          └────────┬────────┘
                                                   │
                                                   │ consume
                                                   ▼
                                          ┌─────────────────┐
                                          │  Worker (pnpm   │
                                          │   worker)       │
                                          └────────┬────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ▼                              ▼                              ▼
           ┌─────────────────┐          ┌─────────────────┐             ┌─────────────────┐
           │  Update machine │          │ Evaluate alert  │             │ Clear dashboard │
           │     status      │          │     rules       │             │  metrics cache  │
           └─────────────────┘          └─────────────────┘             └─────────────────┘

Dashboard / Reports
         │
         ├──▶ Redis cache (metrics, reports)
         │
         ├──▶ PostgreSQL OLTP (live state)
         │
         └──▶ PostgreSQL OLAP (aggregates)
```

---

## Components

### Next.js app

- **Frontend** — React 19 + TypeScript + Tailwind CSS + shadcn/ui.
- **API routes** — Next.js Route Handlers for event ingestion, report refresh, health checks, and Better Auth.
- **Server Actions** — not heavily used; data fetching happens in server components.
- **Authentication** — Better Auth with email/password and organization-based sessions.

Key routes:

| Route | Purpose |
|-------|---------|
| `GET /` | Landing / marketing page |
| `GET /dashboard` | Operations overview |
| `GET /machines` | Machine list and status |
| `GET /alerts` | Open alerts |
| `GET /reports` | Daily report |
| `GET /reports/weekly` | Weekly report |
| `GET /reports/monthly` | Monthly report |
| `POST /api/events` | Ingest operational events |
| `POST /api/olap/refresh` | Refresh OLAP aggregates |
| `GET /api/health` | Health check (OLTP, OLAP, Redis, Kafka) |
| `/api/auth/[...all]` | Better Auth endpoints |

### PostgreSQL OLTP

Operational database running on host port `5434`.

Stores:

- Better Auth users, sessions, accounts, organizations, members, invitations.
- SignalOps machines, events, alerts.

Configured with logical replication (`wal_level=logical`) so Debezium can read the write-ahead log.

### PostgreSQL OLAP

Analytics database running on host port `5435`.

Stores pre-aggregated tables:

- `daily_production`
- `daily_downtime`
- `daily_errors`

Aggregates are rebuilt on demand via `POST /api/olap/refresh`.

### Apache Kafka

Kafka 4.0 in KRaft mode (no ZooKeeper) on host port `9092`.

Topics:

- `signalops.public.events` — Debezium CDC events from the OLTP `events` table.
- `signalops.public.events.dlq` — Dead-letter queue for events that fail processing after retries.
- `signalops_debezium_configs`, `signalops_debezium_offsets`, `signalops_debezium_status` — Debezium internal topics.

### Debezium

Debezium Connect on host port `8083`. Reads the OLTP WAL and publishes change events to Kafka.

Connector config: `infra/debezium-connector.json`.

### Worker

Standalone Node process started with `pnpm worker`. Consumes `signalops.public.events` and applies side effects:

1. Updates machine status from event type.
2. Evaluates alert rules (overheating, high error rate, excessive downtime).
3. Clears cached dashboard metrics for the organization.
4. Sends permanently failed events to the DLQ after 3 retries.

### Redis

Redis 7 on host port `6379`. Used as a cache layer:

- Dashboard metrics: 30-second TTL.
- OLAP reports (daily/weekly/monthly): 5-minute TTL.

Cache is invalidated on event ingestion, report refresh, and after the worker processes an event.

Redis is optional at runtime; helpers fall back to no-op if `REDIS_URL` is unset.

### OpenTelemetry + Grafana

- OpenTelemetry Collector on ports `4317` (gRPC), `4318` (HTTP), `8889` (Prometheus scrape).
- Grafana on port `3001` with a provisioned `SignalOps App` dashboard.
- App emits counters for events ingested, alerts created, and report refreshes.

---

## Data flow

### Event ingestion

1. Client posts to `POST /api/events` with `machineId`, `type`, and optional `payload`.
2. API validates the request and verifies the machine belongs to the user's active organization.
3. Event is inserted into the OLTP `events` table.
4. API clears the organization's cached metrics and reports.
5. API returns `201` immediately.

### Async processing

1. Debezium detects the new row and publishes a CDC event to Kafka.
2. Worker consumes the event.
3. Worker updates machine status and evaluates alert rules.
4. Worker clears cached metrics so the next dashboard load sees the new state.

### Reporting

1. User opens a report page or clicks **Refresh**.
2. For a cache miss, the app queries OLTP for aggregates and writes them to OLAP tables.
3. The report page reads from OLAP (cached for 5 minutes).

---

## Multi-tenancy

Single-database, tenant-scoped rows. Every tenant-scoped table has an `organization_id` column. All queries are filtered by the active organization from the Better Auth session.

Organizations are managed by Better Auth. A user belongs to exactly one organization in the current session context.

---

## Caching strategy

| Data | Cache key | TTL | Invalidation |
|------|-----------|-----|--------------|
| Dashboard metrics | `metrics:{organizationId}` | 30s | Event ingestion, worker side effects, report refresh |
| Daily report | `reports:{organizationId}:daily:{days}` | 5m | Event ingestion, report refresh |
| Weekly report | `reports:{organizationId}:weekly:{weeks}` | 5m | Event ingestion, report refresh |
| Monthly report | `reports:{organizationId}:monthly:{months}` | 5m | Event ingestion, report refresh |

---

## Production hardening

- **Docker image** — `Dockerfile` builds a standalone Next.js image with a non-root user.
- **Health checks** — `GET /api/health` reports OLTP/OLAP reachability and Redis/Kafka status.
- **Structured logging** — `pino` logs JSON in production and pretty logs in development.
- **Graceful shutdown** — worker disconnects Kafka consumer/producer on `SIGINT`/`SIGTERM`. The standalone Next.js server handles `SIGTERM` natively.
- **Optional Compose service** — `docker compose --profile app up -d` runs the production image alongside data services.

---

## File quick reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | OLTP data model |
| `lib/prisma.ts` | Singleton Prisma client |
| `lib/olap.ts` | OLAP pool, aggregates, and report queries |
| `lib/operations.ts` | Dashboard metrics, production trends, alert rules |
| `lib/redis.ts` | Redis cache helpers |
| `lib/logger.ts` | Structured pino logger |
| `lib/kafka.ts` | KafkaJS client and topic names |
| `lib/worker.ts` | Kafka consumer logic |
| `worker.ts` | Worker CLI entry point |
| `app/api/events/route.ts` | Event ingestion endpoint |
| `app/api/olap/refresh/route.ts` | OLAP refresh endpoint |
| `app/api/health/route.ts` | Health check endpoint |
| `infra/debezium-connector.json` | Debezium connector config |
| `docker-compose.yml` | Local infrastructure |
| `Dockerfile` | Production app image |
