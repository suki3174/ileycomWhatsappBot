import bcrypt from "bcrypt";

// Store this in your .env.local file!
const PIN_PEPPER = process.env.PIN_PEPPER;
const PIN_SALT_ROUNDS = 12;

if (!PIN_PEPPER) {
  throw new Error("PIN_PEPPER is not defined in environment variables");
}

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || "").trim());
}

/**
 * Hashes a 4-digit PIN with a high salt round and server-side pepper.
 */
export async function hashPin(pin: string): Promise<string> {
  const pepperedPin = pin + PIN_PEPPER;
  
  return await bcrypt.hash(pepperedPin, PIN_SALT_ROUNDS);
}

/**
 * Verifies the entered PIN against the stored hash.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pepperedPin = pin + PIN_PEPPER;
  return await bcrypt.compare(pepperedPin, hash);
}

export async function verifyStoredPin(pin: string, storedValue: string): Promise<boolean> {
  const provided = String(pin ?? "").trim();
  const stored = String(storedValue ?? "").trim();
  if (!provided || !stored) return false;

  if (isBcryptHash(stored)) {
    return await verifyPin(provided, stored);
  }

  // Backward compatibility for existing plaintext PINs already stored in DB.
  return stored === provided;
}