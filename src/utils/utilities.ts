/* eslint-disable @typescript-eslint/no-explicit-any */


import { FlowRequest } from "@/models/flowRequest";
import crypto from "crypto";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const normToken = (t: string): string => (t ? String(t).trim() : "");

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function formatSimplePrices(product: any): string {
  const euro = product.promo_price_euro ?? product.general_price_euro ?? "";
  const tnd = product.promo_price_tnd ?? product.general_price_tnd ?? "";

  return `${euro}€ | ${tnd} TND`;
}

export function formatStock(product: any): string {
  if (!product.manage_stock) return "Stock non géré";
  return `${product.stock_quantity ?? 0} en stock`;
}

export function getFlowToken(parsed: FlowRequest): string {
  const t = parsed?.data?.flow_token ?? parsed?.flow_token ?? "";
  return typeof t === "string" ? t.trim() : String(t).trim();
}