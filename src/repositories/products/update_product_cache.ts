// Update product flow state cache — in-memory
// TODO: replace with Redis/DB for multi-instance deployments

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UpdateProductState = Record<string, any>;

const cache = new Map<string, UpdateProductState>();

export function getUpdateProductState(flowToken: string): UpdateProductState | null {
  return cache.get(flowToken) ?? null;
}

export function updateUpdateProductState(
  flowToken: string,
  patch: Partial<UpdateProductState>
): void {
  const current = cache.get(flowToken) ?? {};
  cache.set(flowToken, { ...current, ...patch });
}

export function clearUpdateProductState(flowToken: string): void {
  cache.delete(flowToken);
}
