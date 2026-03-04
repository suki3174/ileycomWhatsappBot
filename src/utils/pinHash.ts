import bcrypt from "bcrypt";

// Store this in your .env.local file!
const PIN_PEPPER = process.env.PIN_PEPPER;

if (!PIN_PEPPER) {
  throw new Error("PIN_PEPPER is not defined in environment variables");
}

/**
 * Hashes a 4-digit PIN with a high salt round and server-side pepper.
 */
export async function hashPin(pin: string): Promise<string> {
  // Higher rounds (12) are better for short PINs to slow down attackers
  const saltRounds = 12; 
  const pepperedPin = pin + PIN_PEPPER;
  
  return await bcrypt.hash(pepperedPin, saltRounds);
}

/**
 * Verifies the entered PIN against the stored hash.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pepperedPin = pin + PIN_PEPPER;
  return await bcrypt.compare(pepperedPin, hash);
}