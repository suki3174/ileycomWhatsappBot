

import { FlowRequest } from "@/models/flowRequest";
import crypto from "crypto";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const normToken = (t: string): string => (t ? String(t).trim() : "");

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getFlowToken(parsed: FlowRequest): string {
  const t = parsed?.data?.flow_token ?? parsed?.flow_token ?? "";
  return typeof t === "string" ? t.trim() : String(t).trim();
}

export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  currentPage: number;
} {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(safePage, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    pageItems,
    totalItems,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    currentPage,
  };
}

export const COMMISSION_RATE = 0.2261;

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function computeSellingPrice(
  regular: number,
  promo: number,
): number {
  const safeRegular = toNumber(regular, 0);
  const safePromo = toNumber(promo, 0);
  if (safePromo > 0 && safePromo < safeRegular) {
    return safePromo;
  }
  return safeRegular;
}

export function convertTndToEur(tnd: number): number {
  const safeTnd = toNumber(tnd, 0);
  if (safeTnd <= 0) return 0;
  const eur = safeTnd / 3.358 + 9;
  return Math.round(eur * 100) / 100;
}

export function formatGainTnd(sellingPrice: number): string {
  const price = toNumber(sellingPrice, 0);
  const gain = price * (1 - COMMISSION_RATE);
  return gain.toFixed(2);
}

export function formatGainEur(sellingPrice: number): string {
  const price = toNumber(sellingPrice, 0);
  const gain = price * (1 - COMMISSION_RATE);
  return gain.toFixed(2);
}

export function parsePrice(value: unknown, defaultVal = 0): number {
  if (value === null || value === undefined || value === "") return defaultVal;
  const normalized = String(value).replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

export function hasInvalidPromoPrice(regular: number, promo: number): boolean {
  return regular > 0 && promo > 0 && promo >= regular;
}



export async function resolveEurPrices(
  regularTnd: number,
  promoTnd: number
): Promise<{ regularEur: number; promoEur: number }> {
  return convertTndPricesToEur(regularTnd, promoTnd);
}