import { normToken } from "@/utils/core_utils";
import { UpdateProductState } from "@/models/product_model";
import {
  clearUpdateProductStateCache,
  getUpdateProductStateCache,
  writeUpdateProductStateCache,
} from "@/services/cache/update_product_cache_service";

interface UpdateProductCacheEntry {
  state: UpdateProductState;
}

const updateProductStateStore = new Map<string, UpdateProductCacheEntry>();

/**
 * Reads the update-product state by product ID.
 * Lookup order is in-memory map first, then Redis-backed cache.
 * Requires product_id as the primary key (not flow token).
 */
export async function getUpdateProductState(
  productId: string,
): Promise<UpdateProductState | undefined> {
  if (!productId) return undefined;

  const local = updateProductStateStore.get(productId);
  if (local?.state) {
    return local.state;
  }

  const parsed = await getUpdateProductStateCache(productId);
  if (parsed) {
    updateProductStateStore.set(productId, { state: parsed });
    return parsed;
  }

  return undefined;
}

/**
 * Merges a partial state update into the current update state.
 * The merged state is persisted to both in-memory store and Redis cache.
 */
export async function updateUpdateProductState(
  productId: string,
  partial: Partial<UpdateProductState>,
): Promise<UpdateProductState> {
  if (!productId) {
    throw new Error("Product ID is required for update state");
  }

  const existing = (await getUpdateProductState(productId)) || {};
  const merged: UpdateProductState = {
    ...existing,
    ...partial,
    product_id: productId, // Ensure product_id is always set
  };

  updateProductStateStore.set(productId, {
    state: merged,
  });

  await writeUpdateProductStateCache(productId, merged);

  return merged;
}

/**
 * Clears update state for a product ID from memory and Redis.
 * Used to reset state at flow launch or after completion.
 */
export async function clearUpdateProductState(productId: string): Promise<void> {
  if (!productId) return;

  updateProductStateStore.delete(productId);
  await clearUpdateProductStateCache(productId);
}
