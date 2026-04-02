/**
 * AI Optimization Cache
 * In-memory cache for storing optimization requests and results
 * TODO: In production, consider using Redis for distributed caching
 */

import { OptimizationState } from "@/models/ai_optimization_model";

const optimizationCache = new Map<string, OptimizationState>();

// Cache expiration: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Store an optimization state in cache
 */
export function setOptimizationState(
  productId: string,
  state: OptimizationState
): void {
  // Set expiration time
  state.expiresAt = Date.now() + CACHE_TTL_MS;
  optimizationCache.set(productId, state);
  console.info(`[AI Cache] Optimization state set for product ${productId}:`, state.status);
}

/**
 * Retrieve optimization state from cache
 */
export function getOptimizationState(productId: string): OptimizationState | null {
  const state = optimizationCache.get(productId);

  if (!state) {
    return null;
  }

  // Check if cache has expired
  if (state.expiresAt && Date.now() > state.expiresAt) {
    console.info(`[AI Cache] Optimization state expired for product ${productId}`);
    optimizationCache.delete(productId);
    return null;
  }

  return state;
}

/**
 * Update optimization state in cache
 */
export function updateOptimizationState(
  productId: string,
  updates: Partial<OptimizationState>
): OptimizationState | null {
  const current = getOptimizationState(productId);

  if (!current) {
    console.warn(`[AI Cache] No optimization state found for product ${productId}`);
    return null;
  }

  const updated: OptimizationState = {
    ...current,
    ...updates,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  optimizationCache.set(productId, updated);
  console.info(`[AI Cache] Optimization state updated for product ${productId}:`, updated.status);
  return updated;
}

/**
 * Clear optimization state from cache
 */
export function clearOptimizationState(productId: string): void {
  optimizationCache.delete(productId);
  console.info(`[AI Cache] Optimization state cleared for product ${productId}`);
}

/**
 * Get cache statistics (for debugging)
 */
export function getOptimizationCacheStats() {
  return {
    totalEntries: optimizationCache.size,
    maxTTLMs: CACHE_TTL_MS,
  };
}
