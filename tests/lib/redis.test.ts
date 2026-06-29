import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import {
  getCached,
  setCached,
  deleteCached,
  invalidatePattern,
} from "@/lib/redis";

// These tests exercise the Redis client directly when TEST_REDIS_URL is
// available. If Redis is not running they fall back to verifying the no-op
// behavior so the suite stays green without the container.
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true }) : null;

let redisAvailable = false;

beforeAll(async () => {
  if (!redis) return;
  try {
    await redis.connect();
    redisAvailable = true;
  } catch {
    // Redis is not running; skip the live tests below.
  }
});

afterAll(async () => {
  if (!redis) return;
  await redis.quit();
});

describe("redis cache helpers", () => {
  it("falls back gracefully when Redis is unavailable", async () => {
    // With REDIS_URL cleared in test setup, helpers should return null and not throw.
    expect(await getCached("foo")).toBeNull();
    await setCached("foo", "bar", 60);
    await deleteCached("foo");
    await invalidatePattern("foo:*");
  });

  it("reads back cached values when Redis is available", async () => {
    if (!redisAvailable) return;

    await setCached("signalops:test:redis", { value: 42 }, 60);
    const cached = await getCached<{ value: number }>("signalops:test:redis");
    expect(cached).toEqual({ value: 42 });

    await deleteCached("signalops:test:redis");
    expect(await getCached("signalops:test:redis")).toBeNull();
  });

  it("invalidates keys by pattern when Redis is available", async () => {
    if (!redisAvailable) return;

    await setCached("signalops:test:a:1", 1, 60);
    await setCached("signalops:test:a:2", 2, 60);
    await setCached("signalops:test:b:1", 3, 60);

    await invalidatePattern("signalops:test:a:*");

    expect(await getCached("signalops:test:a:1")).toBeNull();
    expect(await getCached("signalops:test:a:2")).toBeNull();
    expect(await getCached("signalops:test:b:1")).toEqual(3);

    await deleteCached("signalops:test:b:1");
  });
});
