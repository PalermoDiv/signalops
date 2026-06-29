# SignalOps — Developer Command Reference

> Keep this file updated whenever a new command, script, or workflow is added.

---

## Quick start

```bash
# 1. Start data infrastructure
docker compose up -d

# 2. Apply database migrations
pnpm prisma migrate deploy

# 3. Seed demo data
pnpm prisma db seed

# 4. Start Next.js dev server
pnpm dev
```

Open http://localhost:3000 for the landing page.  
Open http://localhost:3000/dashboard for the app shell.  
Check http://localhost:3000/api/health for the health endpoint.

To run the production Docker image instead of `pnpm dev`:

```bash
docker compose --profile app up -d
```

---

## Infrastructure (Docker Compose)

| Command | Purpose |
|---------|---------|
| `docker compose up -d` | Start Postgres OLTP/OLAP, Kafka, and Debezium in the background |
| `docker compose down` | Stop and remove containers |
| `docker compose down -v` | Stop containers **and delete volumes** (wipes all data) |
| `docker compose logs -f <service>` | Follow logs for a service (`postgres-oltp`, `kafka`, `debezium`) |
| `docker compose ps` | Show running containers |
| `docker compose restart <service>` | Restart a single service |

### Services and ports

| Service | Host port | Container name |
|---------|-----------|----------------|
| PostgreSQL OLTP | `5434` | `signalops-postgres-oltp` |
| PostgreSQL OLAP | `5435` | `signalops-postgres-olap` |
| Redis | `6379` | `signalops-redis` |
| Kafka | `9092` | `signalops-kafka` |
| Debezium Connect | `8083` | `signalops-debezium` |
| OpenTelemetry Collector | `4317` / `4318` / `8889` | `signalops-otel-collector` |
| Grafana | `3001` | `signalops-grafana` |
| Next.js app (optional `app` profile) | `3000` | `signalops-app` |

---

## Next.js app

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Create an optimized production build |
| `pnpm start` | Start production server (run after `build`) |
| `pnpm lint` | Run ESLint |

---

## Database (Prisma)

### Everyday workflow

```bash
# Edit prisma/schema.prisma, then:
pnpm prisma migrate dev --name <describe_change>
```

This generates a new migration SQL file and applies it to the database.

### Other useful commands

| Command | Purpose |
|---------|---------|
| `pnpm prisma migrate deploy` | Apply pending migrations without generating new ones (production/CI) |
| `pnpm prisma generate` | Regenerate the Prisma Client from the schema |
| `pnpm prisma db seed` | Run `prisma/seed.ts` |
| `pnpm prisma studio` | Open Prisma Studio in the browser |
| `pnpm prisma migrate reset` | **Wipe the database**, re-run migrations, and seed (development only) |
| `pnpm prisma db push` | Push schema changes without creating a migration (quick prototyping) |

### Direct database access

```bash
# OLTP
psql postgresql://signalops:signalops@localhost:5434/signalops_oltp

# OLAP
psql postgresql://signalops:signalops@localhost:5435/signalops_olap
```

---

## Testing

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once (CI mode) |
| `pnpm worker` | Start the async event processor that consumes Kafka CDC events |

Tests use the `signalops_test` database defined by `TEST_DATABASE_URL` in `.env`. Redis is disabled by default in tests; set `TEST_REDIS_URL` and start the Redis container to exercise the live cache tests.

---

## Seeding and demo data

```bash
pnpm prisma db seed
```

Creates one demo organization and one demo machine with fixed UUIDs:

- Organization: `00000000-0000-0000-0000-000000000001`
- Machine: `00000000-0000-0000-0000-000000000002`

The seed is idempotent — you can run it multiple times.

---

## Event ingestion

### Post a test event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "00000000-0000-0000-0000-000000000001",
    "machineId": "00000000-0000-0000-0000-000000000002",
    "type": "MACHINE_STARTED",
    "payload": { "temperature": 82 }
  }'
```

### Valid event types

- `MACHINE_STARTED`
- `MACHINE_STOPPED`
- `MACHINE_ERROR`
- `TEMPERATURE_RECORDED`
- `PRODUCTION_COMPLETED`

---

## Debezium / Kafka

### Register the Debezium connector

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium-connector.json
```

### Check connector status

```bash
curl http://localhost:8083/connectors
curl http://localhost:8083/connectors/signalops-oltp-connector/status
```

### Delete and re-register the connector

```bash
curl -X DELETE http://localhost:8083/connectors/signalops-oltp-connector
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium-connector.json
```

### List Kafka topics

```bash
docker exec -it signalops-kafka \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

### Consume events from Kafka

```bash
docker exec -it signalops-kafka \
  /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic signalops.public.events \
  --from-beginning
```

---

## Redis

Redis is used to cache dashboard metrics (30s TTL) and OLAP reports (5m TTL). The cache is invalidated when new events are ingested or reports are refreshed.

### URLs

| Tool | URL |
|------|-----|
| Redis | `redis://localhost:6379/0` |
| Redis (tests) | `redis://localhost:6379/1` |

### Check Redis

```bash
redis-cli -u redis://localhost:6379/0 ping
```

### Clear cache

```bash
redis-cli -u redis://localhost:6379/0 FLUSHDB
```

---

## Async event processing

Event ingestion writes to the OLTP database and returns immediately. A separate worker process consumes Debezium CDC events from Kafka and applies side effects (machine status updates and alert rules).

```bash
# Start the worker (run in a separate terminal)
pnpm worker
```

### Worker behavior

- Subscribes to `signalops.public.events`.
- Retries failed processing up to 3 times with exponential backoff.
- Sends permanently failed events to `signalops.public.events.dlq`.

### Register the Debezium connector

The connector is registered manually after `docker compose up`:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infra/debezium-connector.json
```

The connector config uses `publication.autocreate.mode: filtered`, so Debezium creates `dbz_publication` automatically.

---

## Production Docker image

Build and run the Next.js app as a container:

```bash
# Build the image
docker build -t signalops-app .

# Run locally against the Docker Compose data services
docker run -p 3000:3000 --env-file .env \
  -e DATABASE_URL="postgresql://signalops:signalops@host.docker.internal:5434/signalops_oltp" \
  -e OLAP_DATABASE_URL="postgresql://signalops:signalops@host.docker.internal:5435/signalops_olap" \
  -e REDIS_URL="redis://host.docker.internal:6379/0" \
  -e KAFKA_BROKERS="host.docker.internal:9092" \
  signalops-app
```

Or use the optional `app` profile in Docker Compose:

```bash
docker compose --profile app up -d
```

The `app` service overrides connection URLs to use the container network names (`postgres-oltp`, `postgres-olap`, `redis`, `kafka`).

---

## Health checks

The app exposes a health endpoint that checks OLTP, OLAP, Redis, and Kafka:

```bash
curl http://localhost:3000/api/health
```

It returns HTTP `200` when OLTP and OLAP are reachable, and `503` otherwise. Redis and Kafka failures are logged but do not make the app unhealthy.

---

## Logging

SignalOps uses [pino](https://github.com/pinojs/pino) for structured logging.

- Development: pretty-printed logs (`pino-pretty`).
- Production: JSON logs via `pnpm start` / the Docker image.

Set `LOG_LEVEL` to control verbosity (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).

---

## Observability

SignalOps exports OpenTelemetry metrics and traces to the local collector.

### URLs

| Tool | URL | Default credentials |
|------|-----|---------------------|
| Grafana | http://localhost:3001 | `signalops` / `signalops` |
| OTLP gRPC | http://localhost:4317 | — |
| OTLP HTTP | http://localhost:4318 | — |
| Prometheus scrape | http://localhost:8889 | — |

### Pre-built dashboard

A `SignalOps App` dashboard is provisioned automatically. It shows:

- HTTP request rate
- Average request duration
- Events ingested rate
- Total events ingested

### Collector configuration

`otel-collector-config.yaml` receives OTLP and exposes Prometheus metrics on port `8889`. The Grafana data source is provisioned in `grafana/provisioning/`.

---

## Git workflow

```bash
# Check status
git status

# Stage everything
git add -A

# Commit
git commit -m "describe the change"

# Push
git push origin main
```

---

## Environment variables

Required in `.env`:

```env
DATABASE_URL="postgresql://signalops:signalops@localhost:5434/signalops_oltp"
TEST_DATABASE_URL="postgresql://signalops:signalops@localhost:5434/signalops_test"
OLAP_DATABASE_URL="postgresql://signalops:signalops@localhost:5435/signalops_olap"

REDIS_URL="redis://localhost:6379/0"
TEST_REDIS_URL="redis://localhost:6379/1"

OTEL_SERVICE_NAME="signalops"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:4318/v1/traces"
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="http://localhost:4318/v1/metrics"
```

`.env` is gitignored. Do not commit it.

---

## Troubleshooting

### `FATAL: sorry, too many clients already`

Restart the Postgres container or run:

```bash
docker compose restart postgres-oltp
```

### Prisma Client is out of date

```bash
pnpm prisma generate
```

### Database schema is out of sync

```bash
# Development only — wipes data
pnpm prisma migrate reset
```

### Tests fail with database errors

1. Make sure Docker is running: `docker compose up -d`
2. Make sure `TEST_DATABASE_URL` is set in `.env`.
3. Run `pnpm test:run` again.

### Kafka consumer cannot connect

Check that the advertised listeners are correct in `docker-compose.yml`. Debezium connects via the `INTERNAL` listener (`kafka:19092`); external clients connect via `localhost:9092`.

---

## File quick reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Data model |
| `prisma/seed.ts` | CLI seed entry point |
| `lib/seed.ts` | Seed logic (used by tests and CLI) |
| `lib/prisma.ts` | Singleton Prisma client |
| `app/api/events/route.ts` | Event ingestion API |
| `infra/debezium-connector.json` | Debezium connector config |
| `docker-compose.yml` | Local infrastructure |
| `vitest.config.ts` | Test runner config |
| `tests/setup.ts` | Test database setup and reset |
