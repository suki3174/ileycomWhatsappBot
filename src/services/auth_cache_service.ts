import type { Seller } from "@/models/seller_model";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { normToken } from "@/utils/core_utils";

const AUTH_CACHE_DEFAULT_TTL_SEC = 120;
const AUTH_CACHE_MAX_TTL_SEC = 300;
const AUTH_CACHE_MIN_TTL_SEC = 30;
const MESSAGE_DEDUPE_TTL_SEC = 10 * 60;
const TRIGGER_DEDUPE_TTL_SEC = 8;

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

function keySessionByPhone(phone: string): string {
  return `${getRedisPrefix()}:auth:session:phone:${phone}`;
}

function keySessionByToken(token: string): string {
  return `${getRedisPrefix()}:auth:session:token:${token}`;
}

function keyMessageDedupe(messageId: string): string {
  return `${getRedisPrefix()}:auth:dedupe:message:${messageId}`;
}

function keyTriggerDedupe(phone: string, trigger: string): string {
  return `${getRedisPrefix()}:auth:dedupe:trigger:${phone}:${trigger}`;
}

function sanitizeSellerSnapshot(seller: Seller): Seller {
  return {
    ...seller,
    phone: normalizeSellerPhone(String(seller.phone || "")),
    flow_token: normToken(String(seller.flow_token || "")) || null,
    session_active_until:
      seller.session_active_until == null ? null : Number(seller.session_active_until),
  };
}

function resolveAuthTtlSeconds(seller: Seller): number {
  const now = Date.now();
  const sessionUntil = Number(seller.session_active_until || 0);

  if (Number.isFinite(sessionUntil) && sessionUntil > now) {
    const remaining = Math.ceil((sessionUntil - now) / 1000);
    return Math.max(AUTH_CACHE_MIN_TTL_SEC, Math.min(AUTH_CACHE_MAX_TTL_SEC, remaining));
  }

  return AUTH_CACHE_DEFAULT_TTL_SEC;
}

export async function getSellerSessionByPhone(phone: string): Promise<Seller | undefined> {
  const normalized = normalizeSellerPhone(phone);
  if (!normalized) return undefined;

  const redis = await getRedisOrNull();
  if (!redis) return undefined;

  const raw = await redis.get(keySessionByPhone(normalized));
  if (!raw) return undefined;

  try {
    return sanitizeSellerSnapshot(JSON.parse(raw) as Seller);
  } catch {
    return undefined;
  }
}

export async function getSellerSessionByToken(token: string): Promise<Seller | undefined> {
  const normalizedToken = normToken(token);
  if (!normalizedToken) return undefined;

  const redis = await getRedisOrNull();
  if (!redis) return undefined;

  const raw = await redis.get(keySessionByToken(normalizedToken));
  if (!raw) return undefined;

  try {
    return sanitizeSellerSnapshot(JSON.parse(raw) as Seller);
  } catch {
    return undefined;
  }
}

export async function writeSellerSessionCache(seller: Seller): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) return;

  const snapshot = sanitizeSellerSnapshot(seller);
  const ttlSec = resolveAuthTtlSeconds(snapshot);
  const serialized = JSON.stringify(snapshot);

  const phone = normalizeSellerPhone(snapshot.phone);
  const token = normToken(String(snapshot.flow_token || ""));

  const writes: Promise<unknown>[] = [];
  if (phone) {
    writes.push(redis.set(keySessionByPhone(phone), serialized, { EX: ttlSec }));
  }
  if (token) {
    writes.push(redis.set(keySessionByToken(token), serialized, { EX: ttlSec }));
  }
  if (writes.length) {
    await Promise.all(writes);
  }
}

export async function invalidateSellerSessionCache(params: {
  phone?: string;
  token?: string;
  seller?: Seller;
}): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) return;

  const phone = normalizeSellerPhone(
    params.phone || String(params.seller?.phone || ""),
  );
  const token = normToken(
    params.token || String(params.seller?.flow_token || ""),
  );

  const keys: string[] = [];
  if (phone) keys.push(keySessionByPhone(phone));
  if (token) keys.push(keySessionByToken(token));
  if (!keys.length) return;

  await redis.del(keys);
}

export async function markInboundMessageSeen(messageId: string): Promise<boolean> {
  const id = String(messageId || "").trim();
  if (!id) return false;

  const redis = await getRedisOrNull();
  if (!redis) return false;

  const created = await redis.set(keyMessageDedupe(id), "1", {
    EX: MESSAGE_DEDUPE_TTL_SEC,
    NX: true,
  });

  return created !== "OK";
}

export async function markInboundTriggerSeen(
  phone: string,
  trigger: string,
): Promise<boolean> {
  const normalizedPhone = normalizeSellerPhone(phone);
  const normalizedTrigger = String(trigger || "").trim().toLowerCase();
  if (!normalizedPhone || !normalizedTrigger) return false;

  const redis = await getRedisOrNull();
  if (!redis) return false;

  const created = await redis.set(
    keyTriggerDedupe(normalizedPhone, normalizedTrigger),
    "1",
    {
      EX: TRIGGER_DEDUPE_TTL_SEC,
      NX: true,
    },
  );

  return created !== "OK";
}
