/**
 * Optimized Product Flow State Cache
 * In-memory L1 + Redis L2 cache for optimized product flow state.
 * TTL is managed by Redis (1 h); in-memory map is request-scope fast path.
 */

import {
  readOptimizedFlowState,
  writeOptimizedFlowState,
  deleteOptimizedFlowState,
} from "@/services/cache/ai_optimization_cache_service";

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

export async function getOptimizedProductFlowState(
  token: string
): Promise<OptimizedProductFlowState | null> {
  const local = optimizedProductFlowCache.get(token);
  if (local) return local;

  const remote = await readOptimizedFlowState(token);
  if (remote) {
    optimizedProductFlowCache.set(token, remote);
    return remote;
  }

  return null;
}

export async function updateOptimizedProductFlowState(
  token: string,
  state: Partial<OptimizedProductFlowState>
): Promise<void> {
  const current = (await getOptimizedProductFlowState(token)) || {};
  const merged: OptimizedProductFlowState = { ...current, ...state };
  optimizedProductFlowCache.set(token, merged);
  await writeOptimizedFlowState(token, merged);
}

export async function setOptimizedProductFlowState(
  token: string,
  state: OptimizedProductFlowState
): Promise<void> {
  optimizedProductFlowCache.set(token, state);
  await writeOptimizedFlowState(token, state);
}

export async function clearOptimizedProductFlowState(token: string): Promise<void> {
  optimizedProductFlowCache.delete(token);
  await deleteOptimizedFlowState(token);
}
