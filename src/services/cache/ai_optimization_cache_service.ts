import type { OptimizationState } from "@/models/ai_optimization_model";
import type { OptimizedProductFlowState } from "@/repositories/optimizedProductFlow/optimized_product_flow_cache";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

const AI_OPTIMIZATION_STATE_TTL_SEC = 24 * 60 * 60; // 24 hours
const OPTIMIZED_FLOW_STATE_TTL_SEC = 60 * 60; // 1 hour

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function isDebugEnabled(): boolean {
  const raw = String(process.env.AI_OPTIMIZATION_CACHE_DEBUG || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function cacheLog(event: string, details: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.log("[ai-optimization-cache]", event, details);
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

async function readJson<T>(key: string): Promise<T | undefined> {
  const redis = await getRedisOrNull();
  if (!redis) return undefined;

  const raw = await redis.get(key);
  if (!raw) {
    cacheLog("miss", { key });
    return undefined;
  }

  try {
    cacheLog("hit", { key });
    return JSON.parse(raw) as T;
  } catch {
    cacheLog("parse-error", { key });
    return undefined;
  }
}

async function writeJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) return;

  await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  cacheLog("write", { key, ttlSec });
}

async function deleteKey(key: string): Promise<void> {
  const redis = await getRedisOrNull();
  if (!redis) return;

  await redis.del(key);
  cacheLog("invalidate", { key });
}

// ─── AI Optimization State ────────────────────────────────────────────────────

function aiOptimizationStateKey(productId: string): string {
  return `${getRedisPrefix()}:ai-optimization:state:product:${productId}`;
}

export async function readAIOptimizationState(
  productId: string
): Promise<OptimizationState | undefined> {
  const key = aiOptimizationStateKey(productId);
  return readJson<OptimizationState>(key);
}

export async function writeAIOptimizationState(
  productId: string,
  state: OptimizationState
): Promise<void> {
  const key = aiOptimizationStateKey(productId);
  await writeJson(key, state, AI_OPTIMIZATION_STATE_TTL_SEC);
}

export async function deleteAIOptimizationState(productId: string): Promise<void> {
  const key = aiOptimizationStateKey(productId);
  await deleteKey(key);
}

// ─── Optimized Product Flow State ─────────────────────────────────────────────

function optimizedFlowStateKey(token: string): string {
  const normalized = normToken(token) || token;
  return `${getRedisPrefix()}:optimized-flow:state:token:${normalized}`;
}

export async function readOptimizedFlowState(
  token: string
): Promise<OptimizedProductFlowState | undefined> {
  const key = optimizedFlowStateKey(token);
  return readJson<OptimizedProductFlowState>(key);
}

export async function writeOptimizedFlowState(
  token: string,
  state: OptimizedProductFlowState
): Promise<void> {
  const key = optimizedFlowStateKey(token);
  await writeJson(key, state, OPTIMIZED_FLOW_STATE_TTL_SEC);
}

export async function deleteOptimizedFlowState(token: string): Promise<void> {
  const key = optimizedFlowStateKey(token);
  await deleteKey(key);
}
