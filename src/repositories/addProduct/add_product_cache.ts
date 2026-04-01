import { normToken } from "@/utils/core_utils";
import { AddProductState } from "@/models/product_model";

interface AddProductCacheEntry {
  state: AddProductState;
}

const addProductStateStore = new Map<string, AddProductCacheEntry>();

export function getAddProductState(
  token: string,
): AddProductState | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  const entry = addProductStateStore.get(normalized);
  if (!entry) return undefined;
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
  addProductStateStore.set(normalized, {
    state: merged,
  });
  return merged;
}

export function clearAddProductState(token: string): void {
  const normalized = normToken(token);
  if (!normalized) return;
  addProductStateStore.delete(normalized);
}

