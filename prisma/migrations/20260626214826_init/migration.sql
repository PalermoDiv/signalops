-- CreateEnum
CREATE TYPE "machine_status" AS ENUM ('ONLINE', 'OFFLINE', 'RUNNING', 'ERROR');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('MACHINE_STARTED', 'MACHINE_STOPPED', 'MACHINE_ERROR', 'TEMPERATURE_RECORDED', 'PRODUCTION_COMPLETED');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('MACHINE_OVERHEATING', 'EXCESSIVE_DOWNTIME', 'HIGH_ERROR_RATE');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('OPEN', 'RESOLVED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "machine_status" NOT NULL DEFAULT 'OFFLINE',
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "type" "event_type" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "machine_id" TEXT,
    "type" "alert_type" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "machines_organization_id_idx" ON "machines"("organization_id");

-- CreateIndex
CREATE INDEX "events_organization_id_occurred_at_idx" ON "events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "events_machine_id_occurred_at_idx" ON "events"("machine_id", "occurred_at");

-- CreateIndex
CREATE INDEX "alerts_organization_id_status_idx" ON "alerts"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
