 import {
  activateSellerSessionViaPlugin,
  findAllSellers,
  findSellerByFlowToken,
  findSellerByPhone,
  upsertSellerState,
  updateSellerCode,
} from "@/repositories/auth/seller_repo";
import type { Seller } from "@/models/seller_model";
import { consumePendingCode, updateAuthWarmupCache } from "@/repositories/auth/auth_cache";
import {
  generateFlowtoken,
  hasSellerCodeValue,
  sellerEmailMatches,
} from "@/utils/seller_auth_helpers";
import { hashPin, verifyStoredPin } from "@/utils/pin_hash";
import { extractPhoneFromFlowToken } from "@/utils/data_parser";
import { normToken } from "@/utils/core_utils";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function primeAuthWarmupAsync(token: string): void {
  const normalized = token ? String(token).trim() : "";
  if (!normalized) return;

  void (async () => {
    try {
      const hasCode = await sellerHasCode(normalized);
      updateAuthWarmupCache(normalized, {
        hasCode,
        preparedAt: Date.now(),
      });
    } catch (err) {
      console.error("auth warmup failed", err);
    }
  })();
}

// Returns seller resolved by phone from plugin-backed repository.
export async function getSellerByPhone(phone: string ): Promise<Seller | undefined> {
  return await findSellerByPhone(phone);
}

// Returns all sellers from the in-memory fallback list.
export function getAllSellers(): Seller[] {
  return findAllSellers();
}

export async function findSellerByTokenOrPhone(token: string): Promise<Seller | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  // OPTIMIZATION: Token-first lookup order.
  // Flow token is authoritative for current session (no ~7-8s by-phone call needed).
  // Changed from: phone-first, token-fallback.
  // This eliminates the slow /seller/by-phone lookup from SIGN_IN critical path.
  const byToken = await findSellerByFlowToken(normalized);
  if (byToken) return byToken;

  const phone = extractPhoneFromFlowToken(normalized);

  if (phone) {
    const byPhone = await findSellerByPhone(phone);
    if (byPhone) return byPhone;
  }

  return undefined;
}

export async function findSeller(token: string): Promise<Seller | undefined> {
  return await findSellerByTokenOrPhone(token);
}

// Indicates whether seller currently has a non-empty code set.
export async function sellerHasCode(token: string): Promise<boolean> {
  const normalized = normToken(token);

  // Look up by token first (token is authoritative for this flow session)
  let seller = await findSellerByFlowToken(normalized);
  
  // If token lookup fails, try phone-based lookup as fallback
  if (!seller) {
    const phone = extractPhoneFromFlowToken(normalized);
    seller = phone ? await findSellerByPhone(phone) : undefined;
  }

  return hasSellerCodeValue(seller);
}

// OPTIMIZATION: Fast code check for SIGN_UP pre-check guard.
// Flow-token-only, no phone fallback fallback.
// This removes the slow /seller/by-phone call (~7-8s) from SIGN_UP critical path.
// Name: sellerHasCodeByFlowToken (clarifies that phone lookup is NOT done).
export async function sellerHasCodeByFlowToken(token: string): Promise<boolean> {
  const normalized = normToken(token);
  if (!normalized) return false;
  const seller = await findSellerByFlowToken(normalized);
  return hasSellerCodeValue(seller);
}

// Updates seller code and falls back to a read-after-write consistency check.
export async function setSellerCode(token: string, code: string): Promise<Seller | undefined> {
  // Normalize incoming flow token to avoid whitespace mismatch across requests.
  const normalized = normToken(token);
  // Guard clause: empty token cannot be used for plugin lookups/updates.
  if (!normalized) return undefined;
  const hashedCode = await hashPin(code);
  // First attempt: update code directly for this flow token (fast path).
  const updated = await updateSellerCode(normalized, hashedCode);
  // If direct update succeeds, return immediately.
  if (updated) return updated;

  // Consistency fallback: read latest seller state by phone (token changes, phone is stable).
  const current = await findSeller(normalized);
  // If seller is resolved, validate that stored code matches user-provided code.
  if (current) {
    // Normalize stored code value (handle null/undefined safely).
    const stored = current.code == null ? "" : String(current.code).trim();
    // If values match, treat operation as successful even if update response was flaky.
    if (await verifyStoredPin(code, stored)) {
      return current;
    }
  }

  // If neither update nor consistency check confirms success, return failure.
  return undefined;
}

// Ensures seller state row exists for current flow without blocking UI response.
export async function prepareSellerState(token: string): Promise<boolean> {
  // Normalize incoming flow token once for downstream calls.
  const normalized = normToken(token);
  // Guard clause: no token means no state preparation possible.
  if (!normalized) return false;

  // Do a blocking insert/read so signup decisions are based on persisted state.
  try {
    const seller = await upsertSellerState(normalized, null);
    return !!seller;
  } catch (err) {
    console.error("prepareSellerState failed", err);
    return false;
  }
}

// Verifies provided code against the seller code stored in plugin state.
export async function verifyCode(token: string, code: string): Promise<boolean> {
  // Fast path: if we have a recent cached code for this token, use it.
  const pending = consumePendingCode(token) ?? "";
  const provided = String(code).trim();
  if (pending && pending === provided) {
    return true;
  }

  const seller = await findSeller(token);
  if (!seller) return false;
  const stored = seller.code == null ? "" : String(seller.code).trim();
  return await verifyStoredPin(provided, stored);
}

// Activates session in background to keep flow transition latency low.
// Uses a single phone-based state upsert so flow_token and session_active_until
// are written atomically — no dependency on prepareSellerState having completed first.
export async function startSellerSession(token: string): Promise<boolean> {
  const normalized = normToken(token);
  if (!normalized) return false;

  void (async () => {
    const sessionActiveUntil = Date.now() + SESSION_DURATION_MS;
    // OPTIMIZATION: Direct flow-token session activation (fastest path).
    // Changed from: state/insert first, session/activate fallback.
    // Now: session/activate first (faster), state upsert only if session endpoint fails.
    // This avoids unnecessary heavy state join queries on normal SIGN_IN success path.
    const ok = await activateSellerSessionViaPlugin(normalized);
    if (!ok) {
      // Fallback: upsert by phone to recover if session endpoint is temporarily unavailable.
      await upsertSellerState(normalized, null, {
        session_active_until: sessionActiveUntil,
      });
    }
  })();

  return true;
}

// Returns whether seller session is still valid and deactivates expired sessions.
export async function isSessionActive(token: string): Promise<boolean> {
  const normalized = normToken(token);
  const seller = await findSeller(normalized);
  if (!seller) return false;

  if (!seller.session_active_until) return false;

  if (seller.session_active_until < Date.now()) {
    await upsertSellerState(normalized, null, { session_active_until: null });
    return false;
  }

  return true;
}

// Verifies provided email against normalized seller email.
export async function verifySellerEmail(token: string, email: string): Promise<boolean> {
  const seller = await findSeller(token);
  return sellerEmailMatches(seller, email);
}

export async function isSignupPhoneRegistered(token: string): Promise<boolean> {
  const normalized = normToken(token);
  if (!normalized) return false;

  const phone = extractPhoneFromFlowToken(normalized);
  if (!phone) return false;

  const seller = await findSellerByPhone(phone);
  return !!seller;
}

export { normToken };
export { generateFlowtoken };

