import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

// ponytail: Redis is optional at runtime. If REDIS_URL is unset, cache helpers
// fall back to no-op so tests and local dev work without the container.
export const redis = redisUrl ? new Redis(redisUrl) : null;

// Suppress unhandled connection errors; each helper already catches and logs.
redis?.on("error", () => {});

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Redis get failed for ${key}:`, error);
    return null;
  }
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number
) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.error(`Redis set failed for ${key}:`, error);
  }
}

export async function deleteCached(key: string) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Redis del failed for ${key}:`, error);
  }
}

export async function invalidatePattern(pattern: string) {
  if (!redis) return;
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== "0");

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Redis pattern invalidate failed for ${pattern}:`, error);
  }
}
