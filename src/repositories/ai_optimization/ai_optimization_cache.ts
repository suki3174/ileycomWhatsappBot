/**
 * AI Optimization Cache
 * In-memory L1 + Redis L2 cache for optimization state.
 * TTL is managed by Redis (24 h); in-memory map is request-scope fast path.
 */

import { OptimizationState } from "@/models/ai_optimization_model";
import {
  readAIOptimizationState,
  writeAIOptimizationState,
  deleteAIOptimizationState,
} from "@/services/cache/ai_optimization_cache_service";

const optimizationCache = new Map<string, OptimizationState>();

export async function setOptimizationState(
  productId: string,
  state: OptimizationState
): Promise<void> {
  optimizationCache.set(productId, state);
  await writeAIOptimizationState(productId, state);
}

export async function getOptimizationState(
  productId: string
): Promise<OptimizationState | null> {
  const local = optimizationCache.get(productId);
  if (local) return local;

  const remote = await readAIOptimizationState(productId);
  if (remote) {
    optimizationCache.set(productId, remote);
    return remote;
  }

  return null;
}

export async function updateOptimizationState(
  productId: string,
  updates: Partial<OptimizationState>
): Promise<OptimizationState | null> {
  const current = await getOptimizationState(productId);

  if (!current) {
    console.warn(`[AI Cache] No optimization state found for product ${productId}`);
    return null;
  }

  const updated: OptimizationState = { ...current, ...updates };
  optimizationCache.set(productId, updated);
  await writeAIOptimizationState(productId, updated);
  return updated;
}

export async function clearOptimizationState(productId: string): Promise<void> {
  optimizationCache.delete(productId);
  await deleteAIOptimizationState(productId);
}
