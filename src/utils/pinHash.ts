/**
 * Plain mode helper kept for compatibility with previous call sites.
 */
export async function hashPin(pin: string): Promise<string> {
  return String(pin ?? "").trim();
}

/**
 * Plain mode comparison helper kept for compatibility with previous call sites.
 */
export async function verifyPin(pin: string, value: string): Promise<boolean> {
  return String(pin ?? "").trim() === String(value ?? "").trim();
}