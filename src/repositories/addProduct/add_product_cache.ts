import { normToken } from "@/utils/utilities";
import { AddProductState } from "@/models/product_model";


const ADD_PRODUCT_TTL_MS = 60 * 60 * 1000;
 interface AddProductCacheEntry {
  state: AddProductState;
  updatedAt: number;
}
declare global {
  var addProductStateCache:
    | Map<string, AddProductCacheEntry>
    | undefined;
}

globalThis.addProductStateCache =
  globalThis.addProductStateCache ||
  new Map<string, AddProductCacheEntry>();

const addProductStateCache = globalThis.addProductStateCache;

export function getAddProductState(
  token: string,
): AddProductState | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  const entry = addProductStateCache.get(normalized);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > ADD_PRODUCT_TTL_MS) {
    addProductStateCache.delete(normalized);
    return undefined;
  }
  return entry.state;
}

export function updateAddProductState(
  token: string,
  partial: Partial<AddProductState>,
): AddProductState {
  const normalized = normToken(token);
  if (!normalized) {
    return { ...partial };
  }
  const existing = getAddProductState(normalized) || {};
  const merged: AddProductState = {
    ...existing,
    ...partial,
  };
  addProductStateCache.set(normalized, {
    state: merged,
    updatedAt: Date.now(),
  });
  return merged;
}

export function clearAddProductState(token: string): void {
  const normalized = normToken(token);
  if (!normalized) return;
  addProductStateCache.delete(normalized);
}

