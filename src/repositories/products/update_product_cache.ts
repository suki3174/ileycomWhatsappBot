import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";
import { normToken } from "@/utils/core_utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UpdateProductState = Record<string, any>;

interface UpdateProductCacheEntry {
  state: UpdateProductState;
}

const UPDATE_PRODUCT_STATE_TTL_SEC = 30 * 60;
const updateProductStateStore = new Map<string, UpdateProductCacheEntry>();

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function stateKey(token: string): string {
  return `${getRedisPrefix()}:update-product:state:${token}`;
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

export async function getUpdateProductState(
  flowToken: string,
): Promise<UpdateProductState | null> {
  const normalized = normToken(flowToken);
  if (!normalized) return null;

  const local = updateProductStateStore.get(normalized);
  if (local?.state) {
    return local.state;
  }

  const redis = await getRedisOrNull();
  if (!redis) return null;

  const raw = await redis.get(stateKey(normalized));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as UpdateProductState;
    updateProductStateStore.set(normalized, { state: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function updateUpdateProductState(
  flowToken: string,
  patch: Partial<UpdateProductState>,
): Promise<void> {
  const normalized = normToken(flowToken);
  if (!normalized) return;

  const current = (await getUpdateProductState(normalized)) || {};
  const merged = { ...current, ...patch };
  updateProductStateStore.set(normalized, { state: merged });

  const redis = await getRedisOrNull();
  if (!redis) return;
  await redis.set(stateKey(normalized), JSON.stringify(merged), {
    EX: UPDATE_PRODUCT_STATE_TTL_SEC,
  });
}

export async function clearUpdateProductState(flowToken: string): Promise<void> {
  const normalized = normToken(flowToken);
  if (!normalized) return;

  updateProductStateStore.delete(normalized);

  const redis = await getRedisOrNull();
  if (!redis) return;
  await redis.del(stateKey(normalized));
}
