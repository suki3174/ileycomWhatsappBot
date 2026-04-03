import type { Seller } from "@/models/seller_model";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const SUPPORTED_SELLER_COUNTRIES = new Set(["TN", "FR"]);

export function normalizeSellerPhone(phone: string): string {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D+/g, "");
  const normalizedCandidates = new Set<string>();

  normalizedCandidates.add(raw);
  if (digits) normalizedCandidates.add(digits);

  // Normalize common international prefix format: 00XXXXXXXX -> +XXXXXXXX
  if (digits.startsWith("00") && digits.length > 4) {
    normalizedCandidates.add(`+${digits.slice(2)}`);
  }

  if (digits.startsWith("00216") && digits.length === 13) {
    normalizedCandidates.add(digits.slice(2));
    normalizedCandidates.add(`+${digits.slice(2)}`);
  }
  if (digits.startsWith("216") && digits.length === 11) {
    normalizedCandidates.add(digits);
    normalizedCandidates.add(`+${digits}`);
  }
  if (digits.length === 8) {
    normalizedCandidates.add(`216${digits}`);
    normalizedCandidates.add(`+216${digits}`);
  }

  const defaultCountries: Array<"TN" | "FR"> = ["TN", "FR"];
  for (const candidate of normalizedCandidates) {
    for (const defaultCountry of defaultCountries) {
      try {
        const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
        if (!parsed || !parsed.isValid()) continue;
        if (!parsed.country || !SUPPORTED_SELLER_COUNTRIES.has(parsed.country)) continue;

        return `${parsed.countryCallingCode}${String(parsed.nationalNumber || "").replace(/\D+/g, "")}`;
      } catch {
        // Ignore parse errors and continue trying normalized candidates.
      }
    }
  }

  // Legacy Tunisia fallback: keep accepting canonical TN shape even when the
  // number is a test/placeholder that strict validation marks as invalid.
  if (/^216\d{8}$/.test(digits)) {
    return digits;
  }
  if (/^00216\d{8}$/.test(digits)) {
    return digits.slice(2);
  }
  if (/^\d{8}$/.test(digits)) {
    return `216${digits}`;
  }

  // Reject unsupported countries (for example SN) and malformed numbers.
  return "";
}

export function getSellerPhoneCandidates(phone: string): string[] {
  const normalized = normalizeSellerPhone(phone);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  candidates.add(`+${normalized}`);
  candidates.add(`00${normalized}`);

  if (normalized.startsWith("33") && normalized.length === 11) {
    // French local format fallback (0 + 9 digits), useful if legacy rows store local format.
    candidates.add(`0${normalized.slice(2)}`);
  }

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

export function isSupportedSellerPhone(phone: string): boolean {
  return normalizeSellerPhone(phone) !== "";
}