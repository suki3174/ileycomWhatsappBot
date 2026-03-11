import type { Seller } from "@/models/seller_model";

export function generateFlowtoken(seller: Seller): string {
  const token = `flowtoken-${seller.phone}-${Date.now()}`;
  seller.flow_token = token;
  return token;
}

export function hasSellerCodeValue(seller: Seller | undefined): boolean {
  return !!(seller && seller.code !== null && String(seller.code).trim() !== "");
}

export function sellerEmailMatches(seller: Seller | undefined, email: string): boolean {
  if (!seller) return false;
  const stored = String(seller.email || "").trim().toLowerCase();
  const provided = String(email || "").trim().toLowerCase();
  return stored !== "" && stored === provided;
}

export function isPinStrong(pin: string): boolean {
  if (!/^[0-9]{4}$/.test(pin)) return false;

  const digits = pin.split("").map(Number);
  const uniqueDigits = new Set(digits).size;
  if (uniqueDigits < 3) return false;

  const deltas = [
    digits[1] - digits[0],
    digits[2] - digits[1],
    digits[3] - digits[2],
  ];

  const isConstantStep = deltas[0] === deltas[1] && deltas[1] === deltas[2];
  if (isConstantStep) return false;

  const isAlternating = deltas[0] === -deltas[1] && deltas[1] === -deltas[2];
  if (isAlternating) return false;

  return true;
}