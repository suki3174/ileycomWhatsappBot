import { normToken } from "@/utils/utilities";
import type { AddProductState } from "@/repositories/add_product_cache";

interface StoredProduct {
  id: string;
  flowToken: string;
  state: AddProductState & { quantity: number };
  createdAt: number;
  confirmed: boolean;
}

declare global {
  var addProductStore: Map<string, StoredProduct> | undefined;
}

globalThis.addProductStore =
  globalThis.addProductStore || new Map<string, StoredProduct>();

const addProductStore = globalThis.addProductStore;

let productCounter = 0;

export async function saveProductDraft(
  flowToken: string,
  state: AddProductState,
  quantity: number,
): Promise<string> {
  const token = normToken(flowToken);
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

  const id = `mock-prod-${Date.now()}-${productCounter++}`;

  addProductStore.set(id, {
    id,
    flowToken: token,
    state: { ...state, quantity: qty },
    createdAt: Date.now(),
    confirmed: false,
  });

  return id;
}

export async function markProductConfirmed(
  productId: string,
): Promise<void> {
  const existing = addProductStore.get(productId);
  if (!existing) return;
  addProductStore.set(productId, {
    ...existing,
    confirmed: true,
  });
}

export async function getStoredProduct(
  productId: string,
): Promise<StoredProduct | undefined> {
  return addProductStore.get(productId);
}

