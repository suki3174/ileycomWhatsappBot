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

// Normalizes flow tokens to avoid lookup mismatches caused by extra whitespace.
const normToken = (t: string): string => (t ? String(t).trim() : "");

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

  // First attempt: update code directly for this flow token (fast path).
  const updated = await updateSellerCode(normalized, code);
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
  const seller = await findSeller(normToken(token));
  if (!seller) return false;
  const stored = seller.code == null ? "" : String(seller.code).trim();
  const provided = String(code).trim();
  return stored !== "" && stored === provided;
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
export function isValidPinCodeFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

