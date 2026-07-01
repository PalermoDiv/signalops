# SignalOps

> Enterprise operations intelligence from real-time business events.

SignalOps is a full-stack, multi-tenant platform that turns operational events—such as a machine starting, stopping, overheating, or completing production—into dashboards, alerts, analytics, and historical reports.

The project is a production-oriented portfolio application built to explore the ideas behind data-intensive systems: event-driven architecture, change data capture, asynchronous processing, transactional and analytical data separation, caching, observability, and tenant isolation.

## Who is it for?

SignalOps currently focuses on manufacturing operations and is designed for:

- **Operations managers** monitoring live activity, delays, and issues that need attention.
- **Plant managers** tracking utilization, downtime, production, and equipment performance.
- **Executives** reviewing KPIs, trends, and business-wide operational reports.

The data model and architecture are intended to grow into logistics, warehousing, retail, and supply-chain use cases.

## What can it do?

- Display active, online, and offline machines.
- Track production totals, utilization, downtime, and error frequency.
- Detect overheating, excessive downtime, and high error rates.
- Produce daily, weekly, and monthly operational reports.
- Process machine events asynchronously through Kafka.
- Isolate users and operational data by organization.
- Cache dashboards and reports with versioned Redis invalidation.
- Expose health checks, structured logs, telemetry, and Grafana dashboards.
- Retry failed event processing and send permanent failures to a dead-letter topic.

## How it was built

SignalOps uses a Next.js monolith for the product surface and API, supported by separate data infrastructure for transactional work, event processing, caching, analytics, and observability.

```text
Machine event
    │
    ▼
Next.js API ──► PostgreSQL OLTP ──► Debezium CDC ──► Kafka
    │                                                    │
    │                                                    ▼
    │                                              Async worker
    │                                                    │
    ▼                                                    ├──► Machine state
Redis cache ◄────────────────────────────────────────────┼──► Alerts
    │                                                    └──► Cache invalidation
    ▼
Dashboard / reports ◄──────── PostgreSQL OLAP aggregates
```

Events are written once to the OLTP database. Debezium reads PostgreSQL's write-ahead log and publishes changes to Kafka. A separate worker consumes those events idempotently, updates machine state, evaluates alert rules, and invalidates cached results. Reports use a separate PostgreSQL OLAP database so analytical queries do not compete with transactional workloads.

Every tenant-scoped record includes an organization ID. Server-side queries resolve the active organization from the authenticated session and filter data accordingly.

### Technology

| Area | Technology |
| --- | --- |
| Web application | Next.js 16, React 19, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Authentication | Better Auth |
| Transactional database | PostgreSQL 17, Prisma 6 |
| Change data capture | Debezium, PostgreSQL logical replication |
| Event streaming | Apache Kafka in KRaft mode |
| Async processing | KafkaJS worker with retries, idempotency, and DLQ handling |
| Cache | Redis 7 |
| Analytics | PostgreSQL aggregate tables and materialized reporting workflow |
| Observability | OpenTelemetry, Grafana, pino |
| Infrastructure | Docker, Docker Compose |
| Testing | Vitest |

## Run it locally

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/installation)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with Compose

### 1. Clone and install

```bash
git clone https://github.com/PalermoDiv/signalops.git
cd signalops
pnpm install
```

### 2. Configure the environment

Create a `.env` file in the project root:

```dotenv
DATABASE_URL="postgresql://signalops:signalops@localhost:5434/signalops_oltp"
OLAP_DATABASE_URL="postgresql://signalops:signalops@localhost:5435/signalops_olap"
REDIS_URL="redis://localhost:6379/0"
KAFKA_BROKERS="localhost:9092"

BETTER_AUTH_SECRET="replace-with-a-random-secret"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000"

OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

Generate a local authentication secret with:

```bash
openssl rand -base64 32
```

Keep `.env` private; it is ignored by Git.

### 3. Start the infrastructure

```bash
docker compose up -d
docker compose ps
```

This starts PostgreSQL OLTP and OLAP, Redis, Kafka, Debezium Connect, the OpenTelemetry Collector, and Grafana. Wait until the database and Kafka services report healthy before continuing.

### 4. Prepare and seed the database

```bash
pnpm prisma migrate deploy
pnpm prisma generate
pnpm prisma db seed
```

The seed is idempotent and creates a demo organization and machine.

### 5. Register change data capture

After Debezium Connect is ready, register the included connector:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium-connector.json
```

If the connector was already registered, the API returns a conflict; no second connector is needed. Check its status with:

```bash
curl http://localhost:8083/connectors/signalops-oltp-connector/status
```

### 6. Start the application and worker

Run these in separate terminals:

```bash
# Terminal 1: Next.js application
pnpm dev
```

```bash
# Terminal 2: asynchronous Kafka consumer
pnpm worker
```

Open [http://localhost:3000](http://localhost:3000), create an account, and sign in. The application will guide authenticated users through the organization-scoped dashboard.

## Local services

| Service | URL or port |
| --- | --- |
| SignalOps | [http://localhost:3000](http://localhost:3000) |
| Health endpoint | [http://localhost:3000/api/health](http://localhost:3000/api/health) |
| Grafana | [http://localhost:3001](http://localhost:3001) |
| Debezium Connect | [http://localhost:8083](http://localhost:8083) |
| PostgreSQL OLTP | `localhost:5434` |
| PostgreSQL OLAP | `localhost:5435` |
| Redis | `localhost:6379` |
| Kafka | `localhost:9092` |

Grafana's local credentials are `signalops` / `signalops`.

## Verify the project

With the infrastructure running:

```bash
pnpm lint
pnpm test:run
```

Tests use the test database URLs configured in `.env`. See [COMMANDS.md](COMMANDS.md) for the complete testing, database, Kafka, Redis, and event-ingestion command reference.

## Production-like Docker run

The default development workflow runs the application locally for fast refresh. To build and run the standalone production image with the infrastructure instead:

```bash
docker compose --profile app up -d --build
```

## Documentation

- [Architecture overview](ARCHITECTURE.md)
- [Developer command reference](COMMANDS.md)

## License

This project is available under the terms in [LICENSE](LICENSE).
