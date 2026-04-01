import { normToken } from "@/utils/core_utils";
import { AddProductState } from "@/models/product_model";
import { ensureRedisConnected, getRedisPrefix } from "@/lib/redis/client";

interface AddProductCacheEntry {
  state: AddProductState;
}

const ADD_PRODUCT_STATE_TTL_SEC = 30 * 60;
const addProductStateStore = new Map<string, AddProductCacheEntry>();

function isRedisEnabled(): boolean {
  return String(process.env.REDIS_ENABLED || "false").toLowerCase() === "true";
}

function stateKey(token: string): string {
  return `${getRedisPrefix()}:add-product:state:${token}`;
}

async function getRedisOrNull() {
  if (!isRedisEnabled()) return null;
  try {
    return await ensureRedisConnected();
  } catch {
    return null;
  }
}

export async function getAddProductState(
  token: string,
): Promise<AddProductState | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const local = addProductStateStore.get(normalized);
  if (local?.state) {
    return local.state;
  }

  const redis = await getRedisOrNull();
  if (!redis) return undefined;

  const raw = await redis.get(stateKey(normalized));
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as AddProductState;
    addProductStateStore.set(normalized, { state: parsed });
    return parsed;
  } catch {
    return undefined;
  }
}

export async function updateAddProductState(
  token: string,
  partial: Partial<AddProductState>,
): Promise<AddProductState> {
  const normalized = normToken(token);
  if (!normalized) {
    return { ...partial };
  }

  const existing = (await getAddProductState(normalized)) || {};
  const merged: AddProductState = {
    ...existing,
    ...partial,
  };

  addProductStateStore.set(normalized, {
    state: merged,
  });

  const redis = await getRedisOrNull();
  if (redis) {
    await redis.set(stateKey(normalized), JSON.stringify(merged), {
      EX: ADD_PRODUCT_STATE_TTL_SEC,
    });
  }

  return merged;
}

export async function clearAddProductState(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  addProductStateStore.delete(normalized);

  const redis = await getRedisOrNull();
  if (!redis) return;
  await redis.del(stateKey(normalized));
}

