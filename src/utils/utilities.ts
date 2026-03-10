

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

