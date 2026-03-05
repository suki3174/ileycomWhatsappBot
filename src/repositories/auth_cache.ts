import { normToken } from "@/services/auth_service";
import { hashPin } from "@/utils/pinHash";

interface AuthWarmupEntry {
  hasCode: boolean;
  preparedAt: number;
}

const AUTH_WARMUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

declare global {
  var authWarmupCache: Map<string, AuthWarmupEntry> | undefined;
}

globalThis.authWarmupCache = globalThis.authWarmupCache || new Map<string, AuthWarmupEntry>();
const authWarmupCache = globalThis.authWarmupCache;

interface PendingCodeEntry {
  code: string;
  expiresAt: number;
}

const PENDING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

declare global {
  var pendingCodes: Map<string, PendingCodeEntry> | undefined;
}

globalThis.pendingCodes = globalThis.pendingCodes || new Map<string, PendingCodeEntry>();
const pendingCodes = globalThis.pendingCodes;

//checks in cache if user has code
export function getCachedAuthDecision(token: string): AuthWarmupEntry | undefined {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return undefined;
  const entry = authWarmupCache.get(normalized);
  if (!entry) return undefined;
  if (Date.now() - entry.preparedAt > AUTH_WARMUP_TTL_MS) {
    authWarmupCache.delete(normalized);
    return undefined;
  }
  return entry;
}







// set entry in cache
export function updateAuthWarmupCache(token: string, entry:AuthWarmupEntry): void {}





export async function cachePendingCode(token: string, code: string): Promise<void> {
  const normalized = normToken(token);
  if (!normalized) return;
  const trimmed = String(code || "").trim();
  if (!trimmed) return;
  const hashedCode = await hashPin(trimmed);
  pendingCodes.set(normalized, {
    code: hashedCode,
    expiresAt: Date.now() + PENDING_CODE_TTL_MS,
  });
}

export function consumePendingCode(token: string): string | undefined {
  const normalized = normToken(token);
  if (!normalized) return undefined;
  const entry = pendingCodes.get(normalized);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    pendingCodes.delete(normalized);
    return undefined;
  }
  return entry.code;
}