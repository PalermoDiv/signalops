# SignalOps Technical Stack

> Architecture and technology choices for the SignalOps platform.

---

## High-Level Architecture

SignalOps is a full-stack, event-driven operations intelligence platform. Everything runs locally via Docker Compose.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Next.js App                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Frontend   │  │   API Routes │  │     Server Actions       │  │
│  │  (React 19)  │  │  (REST API)  │  │   (Form mutations)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ POST /api/events
                               │ GET  /api/analytics
                               │ GET  /api/machines
                               v
                    ┌─────────────────────┐
                    │   PostgreSQL OLTP   │
                    │  Events, Machines,  │
                    │  Users, Alerts,     │
                    │  Organizations      │
                    └─────────────────────┘
                               │
                               │ Write-Ahead Log (WAL)
                               v
                    ┌─────────────────────┐
                    │       Debezium      │
                    │   (CDC Connector)   │
                    └─────────────────────┘
                               │
                               │ Publishes change events
                               v
                    ┌─────────────────────┐
                    │        Kafka        │
                    │    (Event Bus)      │
                    └─────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              v                v                v
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
    │  Event Store    │ │   Alert     │ │   Analytics     │
    │  Consumer       │ │   Engine    │ │   Consumer      │
    │  (OLTP sync)    │ │             │ │  (OLAP refresh) │
    └─────────────────┘ └─────────────┘ └─────────────────┘
              │                │                │
              v                v                v
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
    │  PostgreSQL     │ │   Redis     │ │  PostgreSQL     │
    │     OLTP        │ │  (caching,  │ │     OLAP        │
    │                 │ │  pub/sub)   │ │ (materialized   │
    │                 │ │             │ │     views)      │
    └─────────────────┘ └─────────────┘ └─────────────────┘
```

---

## Why This Architecture?

The goal is to build a system that demonstrates modern data-intensive application concepts:

- **Event-driven architecture:** Business actions generate events.
- **Event sourcing:** Operational state is derived from an immutable event log.
- **OLTP / OLAP separation:** Transactional data is stored separately from analytical data.
- **Asynchronous processing:** Not every action requires an immediate response.
- **CDC (Change Data Capture):** Database changes are captured and published as events without dual-write risks.

---

## Component Breakdown

### 1. Frontend & Backend — Next.js 16

Next.js serves as both the frontend and backend layer.

- **Frontend:** React 19 + TypeScript + Tailwind CSS + shadcn/ui.
- **Backend:** Next.js Route Handlers for REST API endpoints.
- **Mutations:** Server Actions for form submissions and internal UI actions.

**Key API endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/events` | Ingest operational events |
| `GET`  | `/api/machines` | List machines |
| `GET`  | `/api/analytics/overview` | Dashboard analytics |
| `GET`  | `/api/alerts` | Active alerts |

---

### 2. OLTP Database — PostgreSQL

PostgreSQL stores transactional data:

- Events
- Machines
- Users
- Organizations (tenants)
- Alerts
- Sessions

**Why PostgreSQL for OLTP?**

- ACID transactions.
- Excellent relational model for machines, users, events.
- Strong support for time-series-like event queries.
- Works natively with Prisma.
- Logical replication enables CDC via Debezium.

---

### 3. CDC — Debezium

Debezium reads PostgreSQL's Write-Ahead Log (WAL) using logical replication.

**Flow:**

```
Event written to PostgreSQL OLTP
        |
        v
PostgreSQL writes to WAL
        |
        v
Debezium reads WAL
        |
        v
Debezium publishes change event to Kafka
```

**Why CDC?**

- No dual-write problem.
- If the transaction commits, the event is guaranteed to reach Kafka.
- Applications only write to the database.
- Excellent for learning real-world event-driven pipelines.

**Kafka topic format:**

```
dbserver.public.events
```

Each message contains:

- `before`: previous row state
- `after`: new row state
- `op`: operation type (`c` = create, `u` = update, `d` = delete)
- `source`: metadata about the database and table

---

### 4. Event Bus — Kafka

Kafka receives change events from Debezium and distributes them to consumers.

**Topics:**

| Topic | Source | Purpose |
|-------|--------|---------|
| `dbserver.public.events` | Debezium | Raw event changes from OLTP |
| `alerts.triggered` | Alert engine | New alerts generated |
| `analytics.refresh` | Analytics consumer | Trigger OLAP refresh |

**Consumers:**

- **Event persistence consumer:** Ensures events are indexed or cached.
- **Alert engine consumer:** Detects overheating, downtime, error spikes.
- **Analytics consumer:** Refreshes materialized views in OLAP.

---

### 5. OLAP Database — PostgreSQL with Materialized Views

PostgreSQL stores analytical data in a separate database.

- Aggregates derived from OLTP events.
- Materialized views for dashboards and reports.
- Refreshed asynchronously by Kafka consumers.

**Examples of materialized views:**

- `mv_machine_utilization`
- `mv_daily_production`
- `mv_downtime_trends`
- `mv_error_frequency`

**Why PostgreSQL for OLAP in the MVP?**

- Simpler local setup.
- Already using PostgreSQL for OLTP.
- Materialized views are enough for the first version.
- Can be replaced with ClickHouse or DuckDB later.

---

### 6. Caching — Redis

Redis is used for:

- Caching frequently accessed data (machine status, active alerts).
- Pub/sub for real-time dashboard updates.
- Storing ephemeral state (rate limits, session metadata).

---

### 7. Authentication — Better Auth

Better Auth handles user authentication and session management.

**Why Better Auth over NextAuth.js?**

- Built for modern Next.js with first-class Server Actions support.
- Organizations / multi-tenant teams are supported natively.
- Self-hosted with PostgreSQL — no external auth provider required.
- Strong TypeScript support.

**Alternative:** NextAuth.js (Auth.js) v5 is also valid, but Better Auth fits the multi-tenant requirement more cleanly.

---

### 8. Multi-Tenancy

SignalOps is multi-tenant: each **Enterprise / Organization** has isolated users, machines, events, and dashboards.

**Approach: single database, multi-tenant rows**

Every tenant-scoped table includes an `organization_id` column.

```sql
CREATE TABLE machines (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Tenant isolation rules:**

- Every user belongs to exactly one organization.
- Every query filters by the user's `organization_id`.
- The organization is resolved from the authenticated session.
- Future: consider PostgreSQL Row-Level Security (RLS) for defense in depth.

**Example query:**

```sql
SELECT * FROM machines
WHERE organization_id = 'org-uuid-from-session';
```

---

### 9. Observability

- **OpenTelemetry:** traces across Next.js, PostgreSQL, Kafka, and Debezium.
- **Grafana:** dashboards for metrics and logs.
- **Kafka UI:** inspect topics, messages, and consumer groups.

---

## Docker Compose Services

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres-oltp
      - postgres-olap
      - redis
      - kafka

  postgres-oltp:
    image: postgres:17
    environment:
      POSTGRES_DB: signalops_oltp
      POSTGRES_USER: signalops
      POSTGRES_PASSWORD: signalops

  postgres-olap:
    image: postgres:17
    environment:
      POSTGRES_DB: signalops_olap
      POSTGRES_USER: signalops
      POSTGRES_PASSWORD: signalops

  redis:
    image: redis:7-alpine

  kafka:
    image: apache/kafka:latest
    # KRaft mode: no ZooKeeper required

  debezium:
    image: debezium/connect:latest
    depends_on:
      - kafka
      - postgres-oltp

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    ports:
      - "8080:8080"
```

---

## Development Principles

1. **Vertical slices first.** Build one complete feature at a time.
2. **Event ingestion is the backbone.** Everything starts with an event.
3. **CDC is the source of truth for Kafka.** No direct API writes to Kafka.
4. **Multi-tenant from the start.** Every tenant-scoped table has `organization_id`.
5. **Test everything.** Unit tests, integration tests, and end-to-end tests.
6. **Document decisions.** Every architectural choice has a one-line justification.

---

## Future Evolution

| Component | MVP | Future |
|-----------|-----|--------|
| OLTP | PostgreSQL | PostgreSQL or CockroachDB |
| OLAP | PostgreSQL materialized views | ClickHouse or DuckDB |
| CDC | Debezium | Debezium or native logical replication |
| Auth | Better Auth | Better Auth + SSO/SAML |
| Real-time | Redis pub/sub | WebSockets or Kafka Streams |

---

## References

- [Designing Data-Intensive Applications](https://dataintensive.net/) by Martin Kleppmann
- [Debezium Documentation](https://debezium.io/documentation/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Better Auth Documentation](https://www.better-auth.com/)
