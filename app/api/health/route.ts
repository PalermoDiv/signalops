import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { olapPool } from "@/lib/olap";
import { redis } from "@/lib/redis";
import { kafka } from "@/lib/kafka";
import { logger } from "@/lib/logger";

interface HealthCheck {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

async function checkOltp(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkOlap(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await olapPool.query("SELECT 1");
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  if (!redis) {
    return { healthy: true, latencyMs: 0, error: "not configured" };
  }
  try {
    await redis.ping();
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkKafka(): Promise<HealthCheck> {
  const start = Date.now();
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.fetchTopicMetadata();
    await admin.disconnect();
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    try {
      await admin.disconnect();
    } catch {
      // ignore disconnect errors
    }
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const [oltp, olap, redisStatus, kafkaStatus] = await Promise.all([
    checkOltp(),
    checkOlap(),
    checkRedis(),
    checkKafka(),
  ]);

  const checks = {
    oltp,
    olap,
    redis: redisStatus,
    kafka: kafkaStatus,
  };

  // ponytail: OLTP and OLAP are critical; Redis/Kafka are optional at this stage.
  const healthy = oltp.healthy && olap.healthy;
  const status = healthy ? "healthy" : "unhealthy";

  logger.info({ status, checks }, "Health check completed");

  return NextResponse.json(
    {
      status,
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
