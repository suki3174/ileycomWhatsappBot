import type { Seller } from "@/models/seller_model";

export function normalizeSellerPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return "";

  // Canonical format in this project: Tunisian country code prefix without +
  // e.g. 21650354773. Supported inputs include 8-digit local, 216-prefixed,
  // and 00216-prefixed variants.
  if (digits.startsWith("00216") && digits.length === 13) return digits.slice(2);
  if (digits.length === 8) return `216${digits}`;
  if (digits.startsWith("216") && digits.length === 11) return digits;

  // Tunisia-only app: reject any other format instead of guessing.
  return "";
}

export function getSellerPhoneCandidates(phone: string): string[] {
  const normalized = normalizeSellerPhone(phone);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  if (normalized.startsWith("216") && normalized.length === 11) {
    candidates.add(normalized.slice(-8));
  }

  return Array.from(candidates);
}

export function areEquivalentSellerPhones(left: string, right: string): boolean {
  const leftCandidates = getSellerPhoneCandidates(left);
  const rightCandidates = new Set(getSellerPhoneCandidates(right));
  if (leftCandidates.length === 0 || rightCandidates.size === 0) return false;

  return leftCandidates.some((candidate) => rightCandidates.has(candidate));
}

export function generateFlowtoken(phone: string): string {
  const normalizedPhone = normalizeSellerPhone(phone);
  const token = `flowtoken-${normalizedPhone}-${Date.now()}`;
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
  const normalized = normalizeSellerPhone(phone);
  // Tunisian canonical format: country code 216 + 8 local digits = 11 digits total.
  return normalized.startsWith("216") && normalized.length === 11;
}