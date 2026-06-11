import { normToken } from "@/utils/core_utils";
import { AddProductState } from "@/models/product_model";
import {
  clearAddProductDraftStateCache,
  getAddProductDraftStateCache,
  writeAddProductDraftStateCache,
} from "@/services/cache/add_product_cache_service";

interface AddProductCacheEntry {
  state: AddProductState;
}

const addProductStateStore = new Map<string, AddProductCacheEntry>();

/**
 * Reads the add-product draft state for a flow token.
 * Lookup order is in-memory map first, then Redis-backed cache.
 */
export async function getAddProductState(
  token: string,
): Promise<AddProductState | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const local = addProductStateStore.get(normalized);
  if (local?.state) {
    return local.state;
  }

  const parsed = await getAddProductDraftStateCache(normalized);
  if (parsed) {
    addProductStateStore.set(normalized, { state: parsed });
    return parsed;
  }

  return undefined;
}

/**
 * Merges a partial state update into the current draft state.
 * The merged state is persisted to both in-memory store and Redis cache.
 */
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

  await writeAddProductDraftStateCache(normalized, merged);

  return merged;
}

/**
 * Clears draft state for a flow token from memory and Redis.
 * Used to reset state at flow launch or after completion.
 */
export async function clearAddProductState(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  addProductStateStore.delete(normalized);
  await clearAddProductDraftStateCache(normalized);
}

