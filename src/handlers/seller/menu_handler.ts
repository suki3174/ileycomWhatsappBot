import { Seller } from "@/models/seller_model";
import { getSellerByPhone, isSessionActive } from "@/services/auth_service";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";

const MENU_TRIGGERS = new Set([
  "Voir mes commandes",
  "Voir mes produits",
  "Modifier un produit",
]);

const TRIGGER_TO_ENDPOINT: Record<string, string> = {
  "Voir mes commandes": "/api/seller/ordersFlow/send",
  "Voir mes produits": "/api/seller/productsFlow/send",
  "Modifier un produit": "/api/seller/updateProductFlow/send",
};

const AUTH_FLOW_SEND_ENDPOINT = "/api/seller/authFlow/send";

function normalizePhoneCandidates(phone: string): string[] {
  const normalized = normalizeSellerPhone(phone);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  // Temporary compatibility fallback for legacy rows stored without country code.
  if (normalized.startsWith("216") && normalized.length === 11) {
    candidates.add(normalized.slice(-8));
  }

  return Array.from(candidates);
}

export async function handleIncomingMessage(
  phone: string,
  messageBody: string,
  options?: { messageId?: string; messageTimestamp?: string },
): Promise<void> {
  const trigger = messageBody.trim();
  const senderPhone = normalizeSellerPhone(phone);
  void options;

  if (!MENU_TRIGGERS.has(trigger)) {
    console.log(`[handleIncomingMessage] Ignored unknown trigger: "${trigger}"`);
    return;
  }

  if (!senderPhone) {
    console.log("[handleIncomingMessage] No phone provided");
    return;
  }

  const phoneCandidates = normalizePhoneCandidates(senderPhone);
  let seller: Seller | undefined;
  for (const candidate of phoneCandidates) {
    seller = await getSellerByPhone(candidate);
    if (seller) break;
  }

  if (!seller) {
    console.log(`[handleIncomingMessage] Seller not found for phone ${senderPhone} (candidates=${phoneCandidates.join(",")})`);
    return;
  }

  const active = await isSessionActive(seller.flow_token ?? "");

  if (!active) {
    console.log(`[handleIncomingMessage] Session expired for ${senderPhone}, sending auth flow.`);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
      const authResponse = await fetch(`${baseUrl}${AUTH_FLOW_SEND_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller, phone: senderPhone }),
      });

      const authData = await authResponse.json();
      console.log(`[handleIncomingMessage] Session inactive -> auth flow sent`, authData);
    } catch (error) {
      console.error(`[handleIncomingMessage] Failed to send auth flow for ${senderPhone}:`, error);
    }

    return;
  }

  const endpoint = TRIGGER_TO_ENDPOINT[trigger];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller, phone: senderPhone }),
    });

    const data = await response.json();
    console.log(`[handleIncomingMessage] "${trigger}" → ${endpoint}`, data);
  } catch (error) {
    console.error(`[handleIncomingMessage] Failed to call ${endpoint}:`, error);
  }
}



