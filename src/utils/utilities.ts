

import crypto from "crypto";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}