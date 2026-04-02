import type { Seller } from "@/models/seller_model";

export function normalizeSellerPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return "";

  // Canonical format in this project: Tunisian country code prefix without +
  // e.g. 21650354773. If only local 8 digits are provided, prefix with 216.
  if (digits.length === 8) return `216${digits}`;
  if (digits.startsWith("216") && digits.length === 11) return digits;

  // Keep as-is for unexpected lengths to avoid destructive rewrites.
  return digits;
}

export function generateFlowtoken(phone: string): string {
  const normalizedPhone = normalizeSellerPhone(phone);
  const token = `flowtoken-${normalizedPhone || String(phone || "").replace(/\D+/g, "")}-${Date.now()}`;
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

export function isTunisianPhone(phone: string): boolean {
  const digits = String(phone || "").replace(/\D+/g, "");
  // Tunisian format: country code 216 + 8 local digits = 11 digits total
  // e.g., 21650354773 or 216<8digits>
  return digits.startsWith("216") && digits.length === 11;
}