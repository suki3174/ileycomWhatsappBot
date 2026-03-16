import { normToken } from "@/utils/utilities";

export interface UpdateProductState {
  product_id?: string;
  images?: string[]; // base64 images (raw) selected by user
  photos_modifiees?: boolean;
  product_name?: string;
  prix_regulier_tnd?: string;
  prix_promo_tnd?: string;
  prix_regulier_eur?: string;
  prix_promo_eur?: string;
  longueur?: string;
  largeur?: string;
  profondeur?: string;
  unite_dimension?: string;
  valeur_poids?: string;
  unite_poids?: string;
  couleur?: string;
  taille?: string;
  quantite?: string;
  product_category?: string;
  product_subcategory?: string;
  categories?: { id: string; title: string }[];
  subcategoriesByCategory?: Record<
    string,
    Array<{ id: string; title: string; description: string }>
  >;
}

interface Entry {
  state: UpdateProductState;
  updatedAt: number;
}

const TTL_MS = 60 * 60 * 1000;

declare global {
  var updateProductStateCache: Map<string, Entry> | undefined;
}

globalThis.updateProductStateCache =
  globalThis.updateProductStateCache || new Map<string, Entry>();

const cache = globalThis.updateProductStateCache;

export function getUpdateProductState(token: string): UpdateProductState | undefined {
  const t = normToken(token);
  if (!t) return undefined;
  const entry = cache.get(t);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > TTL_MS) {
    cache.delete(t);
    return undefined;
  }
  return entry.state;
}

export function updateUpdateProductState(
  token: string,
  partial: Partial<UpdateProductState>,
): UpdateProductState {
  const t = normToken(token);
  if (!t) return { ...partial };
  const current = getUpdateProductState(t) || {};
  const merged: UpdateProductState = { ...current, ...partial };
  cache.set(t, { state: merged, updatedAt: Date.now() });
  return merged;
}

export function clearUpdateProductState(token: string): void {
  const t = normToken(token);
  if (!t) return;
  cache.delete(t);
}

