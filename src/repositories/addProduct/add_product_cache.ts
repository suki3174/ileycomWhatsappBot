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

export async function clearAddProductState(token: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;

  addProductStateStore.delete(normalized);
  await clearAddProductDraftStateCache(normalized);
}

