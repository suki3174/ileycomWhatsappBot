 import {
  activateSellerSessionViaPlugin,
  findAllSellers,
  findSellerByFlowToken,
  findSellerByPhone,
  findSellerStateByPhone as findSellerStateByPhoneFromPlugin,
  upsertSellerState,
  updateSellerCode,
} from "@/repositories/auth/seller_repo";
import type { Seller } from "@/models/seller_model";
import {
  getSellerSessionByPhone,
  getSellerSessionByToken,
  invalidateSellerSessionCache,
  writeSellerSessionCache,
} from "@/services/cache/auth_cache_service";
import {
  areEquivalentSellerPhones,
  generateFlowtoken,
  getSellerPhoneCandidates,
  hasSellerCodeValue,
  normalizeSellerPhone,
  sellerEmailMatches,
} from "@/utils/seller_auth_helpers";
import { hashPin, verifyStoredPin } from "@/utils/pin_hash";
import { extractPhoneFromFlowToken } from "@/utils/data_parser";
import { normToken } from "@/utils/core_utils";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export type SellerFlowAuthResult = {
  ok: boolean;
  reason: "ok" | "seller-not-found" | "session-expired";
  seller?: Seller;
  phone: string;
  token: string;
};

// Returns seller resolved by phone from plugin-backed repository.
export async function getSellerByPhone(phone: string ): Promise<Seller | undefined> {
  const cached = await getSellerSessionByPhone(phone);
  if (cached) return cached;

  const seller = await findSellerByPhone(phone);
  if (seller) {
    await writeSellerSessionCache(seller);
  }
  return seller;
}

// Returns all sellers from the in-memory fallback list.
export function getAllSellers(): Seller[] {
  return findAllSellers();
}

export async function findSellerByTokenOrPhone(token: string): Promise<Seller | undefined> {
  const normalized = normToken(token);
  if (!normalized) return undefined;

  const cachedByToken = await getSellerSessionByToken(normalized);
  if (cachedByToken) return cachedByToken;

  // OPTIMIZATION: Token-first lookup order.
  // Flow token is authoritative for current session (no ~7-8s by-phone call needed).
  // Changed from: phone-first, token-fallback.
  // This eliminates the slow /seller/by-phone lookup from SIGN_IN critical path.
  const byToken = await findSellerByFlowToken(normalized);
  if (byToken) {
    await writeSellerSessionCache(byToken);
    return byToken;
  }

  const phone = extractPhoneFromFlowToken(normalized);

  if (phone) {
    const byPhone = await findSellerByPhone(phone);
    if (byPhone) {
      await writeSellerSessionCache(byPhone);
      return byPhone;
    }
  }

  return undefined;
}

export async function findSeller(token: string): Promise<Seller | undefined> {
  return await findSellerByTokenOrPhone(token);
}

async function clearExpiredSession(token: string, seller: Seller): Promise<void> {
  const deactivated = await upsertSellerState(token, null, { session_active_until: null });
  await invalidateSellerSessionCache({ token, seller: deactivated || seller });
}

export async function getSellerStateByPhoneStrict(phone: string): Promise<Seller | undefined> {
  const normalizedPhone = normalizeSellerPhone(phone);
  if (!normalizedPhone) return undefined;

  const candidates = getSellerPhoneCandidates(normalizedPhone);
  for (const candidate of candidates) {
    const seller = await findSellerStateByPhoneFromPlugin(candidate);
    if (!seller) continue;

    await writeSellerSessionCache(seller);
    return seller;
  }

  return undefined;
}

export async function validateSellerFlowAccess(token: string): Promise<SellerFlowAuthResult> {
  const normalizedToken = normToken(token);
  const extractedPhone = normalizeSellerPhone(extractPhoneFromFlowToken(normalizedToken) || "");
  if (!normalizedToken) {
    return { ok: false, reason: "seller-not-found", phone: extractedPhone, token: "" };
  }

  const cached = await getSellerSessionByToken(normalizedToken);
  const cachedToken = normToken(String(cached?.flow_token || ""));
  const seller = cached && cachedToken === normalizedToken
    ? cached
    : await findSellerByFlowToken(normalizedToken);

  if (!seller) {
    return { ok: false, reason: "seller-not-found", phone: extractedPhone, token: normalizedToken };
  }

  const sellerToken = normToken(String(seller.flow_token || ""));
  if (sellerToken !== normalizedToken) {
    await invalidateSellerSessionCache({ token: normalizedToken, seller });
    return {
      ok: false,
      reason: "seller-not-found",
      seller,
      phone: normalizeSellerPhone(String(seller.phone || "")) || extractedPhone,
      token: normalizedToken,
    };
  }

  const sessionActiveUntil = Number(seller.session_active_until || 0);
  const hasSession = Number.isFinite(sessionActiveUntil) && sessionActiveUntil > 0;
  if (!hasSession || sessionActiveUntil <= Date.now()) {
    if (hasSession && sessionActiveUntil <= Date.now()) {
      await clearExpiredSession(normalizedToken, seller);
    }
    return {
      ok: false,
      reason: "session-expired",
      seller,
      phone: normalizeSellerPhone(String(seller.phone || "")) || extractedPhone,
      token: normalizedToken,
    };
  }

  await writeSellerSessionCache(seller);
  return {
    ok: true,
    reason: "ok",
    seller,
    phone: normalizeSellerPhone(String(seller.phone || "")) || extractedPhone,
    token: normalizedToken,
  };
}

export async function validateSellerFlowDispatch(phone: string): Promise<SellerFlowAuthResult> {
  const normalizedPhone = normalizeSellerPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, reason: "seller-not-found", phone: "", token: "" };
  }

  const seller = await getSellerStateByPhoneStrict(normalizedPhone);
  if (!seller) {
    return { ok: false, reason: "seller-not-found", phone: normalizedPhone, token: "" };
  }

  const persistedToken = normToken(String(seller.flow_token || ""));
  const persistedPhone = normalizeSellerPhone(extractPhoneFromFlowToken(persistedToken) || "");
  if (!persistedToken || !areEquivalentSellerPhones(persistedPhone, normalizedPhone)) {
    return {
      ok: false,
      reason: "seller-not-found",
      seller,
      phone: normalizedPhone,
      token: persistedToken,
    };
  }

  const sessionActiveUntil = Number(seller.session_active_until || 0);
  const hasSession = Number.isFinite(sessionActiveUntil) && sessionActiveUntil > 0;
  if (!hasSession || sessionActiveUntil <= Date.now()) {
    if (hasSession && sessionActiveUntil <= Date.now()) {
      await clearExpiredSession(persistedToken, seller);
    }
    return {
      ok: false,
      reason: "session-expired",
      seller,
      phone: normalizedPhone,
      token: persistedToken,
    };
  }

  await writeSellerSessionCache(seller);
  return {
    ok: true,
    reason: "ok",
    seller,
    phone: normalizedPhone,
    token: persistedToken,
  };
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
  if (updated) {
    await writeSellerSessionCache(updated);
    return updated;
  }

  // Consistency fallback: read latest seller state by phone (token changes, phone is stable).
  const current = await findSeller(normalized);
  // If seller is resolved, validate that stored code matches user-provided code.
  if (current) {
    // Normalize stored code value (handle null/undefined safely).
    const stored = current.code == null ? "" : String(current.code).trim();
    // If values match, treat operation as successful even if update response was flaky.
    if (await verifyStoredPin(code, stored)) {
      await writeSellerSessionCache(current);
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
    if (seller) {
      await writeSellerSessionCache(seller);
    }
    return !!seller;
  } catch (err) {
    console.error("prepareSellerState failed", err);
    return false;
  }
}

// Verifies provided code against the seller code stored in plugin state.
export async function verifyCode(token: string, code: string): Promise<boolean> {
  const provided = String(code).trim();

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
  const sessionActiveUntil = Date.now() + SESSION_DURATION_MS;

  // Make session activation blocking so subsequent menu/flow actions
  // observe a committed session_active_until value.
  const ok = await activateSellerSessionViaPlugin(normalized);
  if (ok) {
    const refreshed = await findSellerByFlowToken(normalized);
    if (refreshed) {
      await writeSellerSessionCache(refreshed);
    }
    return true;
  }

  // Fallback: upsert by phone to recover if session endpoint is temporarily unavailable.
  const recovered = await upsertSellerState(normalized, null, {
    session_active_until: sessionActiveUntil,
  });
  if (recovered) {
    await writeSellerSessionCache(recovered);
  }
  return !!recovered;
}

// Returns whether seller session is still valid and deactivates expired sessions.
export async function isSessionActive(token: string): Promise<boolean> {
  const normalized = normToken(token);
  const seller = await findSeller(normalized);
  if (!seller) return false;

  if (!seller.session_active_until) return false;

  if (seller.session_active_until < Date.now()) {
    const deactivated = await upsertSellerState(normalized, null, { session_active_until: null });
    await invalidateSellerSessionCache({ token: normalized, seller: deactivated || seller });
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

