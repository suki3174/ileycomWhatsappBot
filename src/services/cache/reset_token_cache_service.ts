import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

const FALLBACK_TTL_MS = 15 * 60 * 1000;

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function keyForResetToken(resetToken: string): string {
  return `${getRedisPrefix()}:auth:reset:token:${resetToken}`;
}

const memoryResetTokenMap = new Map<string, { flowToken: string; expiresAt: number }>();

export async function storeResetTokenFlowMapping(
  resetToken: string,
  flowToken: string,
  resetTokenExpiryMs: number,
): Promise<void> {
  const token = normToken(resetToken);
  const flow = normToken(flowToken);
  const now = Date.now();
  const expiry = Number(resetTokenExpiryMs || 0);

  if (!token || !flow || !Number.isFinite(expiry) || expiry <= now) return;

  const ttlSec = Math.max(1, Math.ceil((expiry - now) / 1000));

  if (isRedisEnabled()) {
    try {
      const redis = await ensureRedisConnected();
      await redis.set(keyForResetToken(token), flow, { EX: ttlSec });
      return;
    } catch {
      // Fall through to in-memory fallback when Redis is unavailable.
    }
  }

  memoryResetTokenMap.set(token, { flowToken: flow, expiresAt: expiry });
}

export async function consumeFlowTokenByResetToken(
  resetToken: string,
): Promise<string | undefined> {
  const token = normToken(resetToken);
  if (!token) return undefined;

  if (isRedisEnabled()) {
    try {
      const redis = await ensureRedisConnected();
      const key = keyForResetToken(token);
      const flow = await redis.get(key);
      if (!flow) return undefined;
      await redis.del(key);
      return normToken(flow) || undefined;
    } catch {
      // Fall through to in-memory fallback when Redis is unavailable.
    }
  }

  const item = memoryResetTokenMap.get(token);
  memoryResetTokenMap.delete(token);
  if (!item) return undefined;
  if (item.expiresAt <= Date.now()) return undefined;
  return normToken(item.flowToken) || undefined;
}

export async function peekFlowTokenByResetToken(
  resetToken: string,
): Promise<string | undefined> {
  const token = normToken(resetToken);
  if (!token) return undefined;

  if (isRedisEnabled()) {
    try {
      const redis = await ensureRedisConnected();
      const flow = await redis.get(keyForResetToken(token));
      return normToken(String(flow || "")) || undefined;
    } catch {
      // Fall through to in-memory fallback when Redis is unavailable.
    }
  }

  const item = memoryResetTokenMap.get(token);
  if (!item) return undefined;
  if (item.expiresAt <= Date.now()) {
    memoryResetTokenMap.delete(token);
    return undefined;
  }
  return normToken(item.flowToken) || undefined;
}

export function cleanupExpiredResetTokenFallbacks(now = Date.now()): void {
  for (const [token, item] of memoryResetTokenMap.entries()) {
    if (item.expiresAt <= now) {
      memoryResetTokenMap.delete(token);
    }
  }
}

// Run opportunistic cleanup in local/dev fallback mode.
setInterval(() => cleanupExpiredResetTokenFallbacks(), FALLBACK_TTL_MS).unref?.();
