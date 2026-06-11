import { createClient } from "redis";

type AppRedisClient = ReturnType<typeof createClient>;

declare global {
  // eslint-disable-next-line no-var
  var redisClientSingleton: AppRedisClient | undefined;
}

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function getRedisUrl(): string {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  return url;
}

/**
 * Returns the namespace prefix used for all Redis keys in this application so
 * auth cache and dedupe keys remain isolated across environments.
 */
export function getRedisPrefix(): string {
  return String(process.env.REDIS_PREFIX || "ileycom:seller-bot").trim();
}

/**
 * Lazily creates or returns a singleton Redis client with reconnect strategy.
 * It enforces feature gating through REDIS_ENABLED so callers fail fast when
 * cache infrastructure is intentionally disabled.
 */
export function getRedisClient(): AppRedisClient {
  if (!isRedisEnabled()) {
    throw new Error("Redis is disabled. Set REDIS_ENABLED=true to use Redis.");
  }

  if (!globalThis.redisClientSingleton) {
    const client = createClient({
      url: getRedisUrl(),
      socket: {
        reconnectStrategy(retries) {
          return Math.min(1000 * retries, 5000);
        },
      },
    });

    client.on("error", (error) => {
      console.error("[redis] client error", error);
    });

    globalThis.redisClientSingleton = client;
  }

  const client = globalThis.redisClientSingleton;
  if (!client) {
    throw new Error("Redis client initialization failed");
  }
  return client;
}

/**
 * Ensures the shared Redis client is connected before cache operations run and
 * returns the ready-to-use client instance.
 */
export async function ensureRedisConnected(): Promise<AppRedisClient> {
  const client = getRedisClient();
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}
