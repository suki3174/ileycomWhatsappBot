/**
 * Optimized Product Flow State Cache
 * Stores state for the optimized product flow
 */

export interface OptimizedProductFlowState {
  product_id?: string;
  optimization_status?: "pending" | "processing" | "completed" | "failed";
  optimized_name?: string;
  optimized_short_description?: string;
  optimized_full_description?: string;
  suggested_tags?: string[];
  suggested_categories?: string[];
  error_message?: string;
  checked_at?: number;
}

const optimizedProductFlowCache = new Map<string, OptimizedProductFlowState>();

/**
 * Get optimized product flow state from cache
 */
export function getOptimizedProductFlowState(
  token: string
): OptimizedProductFlowState | null {
  return optimizedProductFlowCache.get(token) || null;
}

/**
 * Update optimized product flow state in cache
 */
export function updateOptimizedProductFlowState(
  token: string,
  state: Partial<OptimizedProductFlowState>
): void {
  const current = getOptimizedProductFlowState(token) || {};
  optimizedProductFlowCache.set(token, { ...current, ...state });
}

/**
 * Set optimized product flow state
 */
export function setOptimizedProductFlowState(
  token: string,
  state: OptimizedProductFlowState
): void {
  optimizedProductFlowCache.set(token, state);
}

/**
 * Clear optimized product flow state
 */
export function clearOptimizedProductFlowState(token: string): void {
  optimizedProductFlowCache.delete(token);
}
