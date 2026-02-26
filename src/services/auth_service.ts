 import {
  activateSellerSession,
  findAllSellers,
  findSellerByFlowToken,
  findSellerByPhone,
  updateSellerCode,
} from "@/repositories/seller_repo";
import type { Seller } from "@/models/seller.model";

const normToken = (t: string): string => (t ? String(t).trim() : "");

export function getSellerByPhone(phone: string ): Seller | undefined {
  return findSellerByPhone(phone);
}
export function getAllSellers(): Seller[] {
  return findAllSellers();
}

export function generateFlowtoken(seller:Seller): string {
  // Reuse existing token if present to avoid breaking in-flight flows
 
  // In a real application, you'd want to generate a secure, unique token.
  // For this example, we'll just use a simple placeholder.
  const token = `flowtoken-${seller.phone}-${Date.now()}`;
  seller.flow_token = token;
  return token;
}
export function findSeller(token: string): Seller | undefined {
  return findSellerByFlowToken(normToken(token));
} 
export function sellerHasCode(token: string): boolean {
  const seller = findSeller(normToken(token));
  return !!(seller && seller.code !== null && String(seller.code).trim() !== "");
}

export function setSellerCode(token: string, code: string): Seller | undefined {

  return updateSellerCode(normToken(token), code);
}

export function verifyCode(token: string, code: string): boolean {
  const seller = findSeller(normToken(token));
  if (!seller) return false;
  const stored = seller.code == null ? "" : String(seller.code).trim();
  const provided = String(code).trim();
  return stored !== "" && stored === provided;
}
export function activateSession(token: string): boolean {
  return activateSellerSession(normToken(token));
}
export function isSessionActive(token: string): boolean {
 const seller = findSellerByFlowToken(token);
  if (!seller) return false;

  if (!seller.session_active_until) return false;

  if (seller.session_active_until < Date.now()) {
    seller.session_active_until = null; // cleanup
    return false;
  }

  return true;
}

export function verifySellerEmail(token: string, email: string): boolean {
  const seller = findSeller(normToken(token));
  if (!seller) return false;
  const stored = String(seller.email || "").trim().toLowerCase();
  const provided = String(email || "").trim().toLowerCase();
  console.log ("stored", stored);
  console.log ("provided", provided);
  return stored !== "" && stored === provided;
}

export function isValidPinCodeFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

