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
| Kafka | `9092` | `signalops-kafka` |
| Debezium Connect | `8083` | `signalops-debezium` |

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

Tests use the `signalops_test` database defined by `TEST_DATABASE_URL` in `.env`.

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
