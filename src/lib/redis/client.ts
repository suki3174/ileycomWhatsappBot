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

export function getRedisPrefix(): string {
  return String(process.env.REDIS_PREFIX || "ileycom:seller-bot").trim();
}

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

export async function ensureRedisConnected(): Promise<AppRedisClient> {
  const client = getRedisClient();
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}
