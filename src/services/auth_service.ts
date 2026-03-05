 import {
  activateSellerSession,
  desactivateSellerSession,
  findAllSellers,
  findSellerByFlowToken,
  findSellerByPhone,
  insertSellerState,
  updateSellerCode,
} from "@/repositories/seller_repo";
import type { Seller } from "@/models/seller_model";
import { hashPin, verifyPin } from "@/utils/pinHash";
import { consumePendingCode, updateAuthWarmupCache } from "@/repositories/auth_cache";
import { normToken } from "@/utils/utilities";

// Normalizes flow tokens to avoid lookup mismatches caused by extra whitespace.


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

// Generates a flow token linked to seller phone and current timestamp.
export function generateFlowtoken(seller:Seller): string {
  // In production, this should be replaced with a cryptographically secure token strategy.
  const token = `flowtoken-${seller.phone}-${Date.now()}`;
  seller.flow_token = token;
  return token;
}

// Resolves seller from normalized flow token.
export async function findSeller(token: string): Promise<Seller | undefined> {
  return await findSellerByFlowToken(normToken(token));
} 

// Indicates whether seller currently has a non-empty code set.
export async function sellerHasCode(token: string): Promise<boolean> {
  const seller = await findSeller(normToken(token));
  return !!(seller && seller.code !== null && String(seller.code).trim() !== "");
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

  // Consistency fallback: read latest seller state from plugin using same token.
  const current = await findSellerByFlowToken(normalized);
  // If seller is resolved, validate that stored code matches user-provided code.
  if (current) {
    // Normalize stored code value (handle null/undefined safely).
    const stored = current.code == null ? "" : String(current.code).trim();
    // Normalize provided code value before comparing.
    const provided = String(code).trim();
    // If values match, treat operation as successful even if update response was flaky.
    if (stored !== "" && stored === provided) {
      return current;
    }
  }

  // If neither update nor consistency check confirms success, return failure.
  return undefined;
}

// Ensures seller state row exists for current flow without blocking UI response.
export async function ensureSellerState(token: string): Promise<boolean> {
  // Normalize incoming flow token once for downstream calls.
  const normalized = normToken(token);
  // Guard clause: no token means no state preparation possible.
  if (!normalized) return false;

  // Fire-and-forget state preparation to avoid blocking flow screen transitions.
  void insertSellerState(normalized, null).catch((err) => {
    // Log background error for diagnostics without failing the current flow response.
    console.error("ensureSellerState background error", err);
  });

  // Return success immediately so flow handler can continue quickly.
  return true;
}

// Verifies provided code against the seller code stored in plugin state.
export async function verifyCode(token: string, code: string): Promise<boolean> {
  // Fast path: if we have a recent in-memory code for this token, use it.
  const pending = consumePendingCode(token) ?? "";
  const provided = String(code).trim();
  const isVerified = await verifyPin(provided, pending);
  if (pending && isVerified) {
    return true;
  }

  const seller = await findSeller(normToken(token));
  if (!seller) return false;
  const stored = seller.code == null ? "" : String(seller.code).trim();
  return stored !== "" && isVerified;
}

// Activates session in background to keep flow transition latency low.
export async function activateSession(token: string): Promise<boolean> {
  // Normalize incoming flow token to keep API calls consistent.
  const normalized = normToken(token);
  // Guard clause for missing token.
  if (!normalized) return false;

  // Run session activation in background to prevent delaying SUCCESS screen response.
  void (async () => {
    // First activation attempt.
    const ok = await activateSellerSession(normalized);
    // If first attempt fails, retry once after a short delay.
    if (!ok) {
      // Small delay before retry to smooth transient plugin/network issues.
      await new Promise((resolve) => setTimeout(resolve, 400));
      // Second activation attempt.
      await activateSellerSession(normalized);
    }
  })();

  // Return true immediately so flow can redirect to SUCCESS without waiting.
  return true;
}

// Returns whether seller session is still valid and deactivates expired sessions.
export async function isSessionActive(token: string): Promise<boolean> {
 const seller = await findSellerByFlowToken(token);
  if (!seller) return false;

  if (!seller.session_active_until) return false;

  if (seller.session_active_until < Date.now()) {
    await desactivateSellerSession(token);
    return false;
  }

  return true;
}

// Verifies provided email against normalized seller email.
export async function verifySellerEmail(token: string, email: string): Promise<boolean> {
  const seller = await findSeller(normToken(token));
  if (!seller) return false;
  const stored = String(seller.email || "").trim().toLowerCase();
  const provided = String(email || "").trim().toLowerCase();
  console.log ("stored", stored);
  console.log ("provided", provided);
  return stored !== "" && stored === provided;
}

// Validates PIN format: exactly 4 digits.


export function isPinStrong(pin: string): boolean {
  // 1. Strict Digit Check
  if (!/^[0-9]{4}$/.test(pin)) return false;

  const digits = pin.split('').map(Number);
  
  // 2. Entropy Check (Variety)
  // Rejects pins with only 1 or 2 unique digits (e.g., 1111, 1122, 1211)
  const uniqueDigits = new Set(digits).size;
  if (uniqueDigits < 3) return false;

  // 3. Step Analysis (Differences between adjacent digits)
  // Calculate the 'delta' between each digit
  const deltas = [
    digits[1] - digits[0],
    digits[2] - digits[1],
    digits[3] - digits[2]
  ];

  // Pattern A: Constant Increments (Sequences)
  // Rejects 1234 (deltas [1,1,1]), 8642 (deltas [-2,-2,-2]), etc.
  const isConstantStep = deltas[0] === deltas[1] && deltas[1] === deltas[2];
  if (isConstantStep) return false;

  // Pattern B: Alternating/Symmetric Patterns
  // Rejects 1212 (deltas [1,-1,1]), 8989 (deltas [1,-1,1])
  const isAlternating = deltas[0] === -deltas[1] && deltas[1] === -deltas[2];
  if (isAlternating) return false;

  return true;
}

export { normToken };
