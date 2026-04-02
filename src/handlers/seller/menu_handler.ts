import { Seller } from "@/models/seller_model";
import { getSellerByPhone, isSessionActive } from "@/services/auth_service";

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

export async function handleIncomingMessage(
  phone: string,
  messageBody: string
): Promise<void> {
  const trigger = messageBody.trim();

  if (!MENU_TRIGGERS.has(trigger)) {
    console.log(`[handleIncomingMessage] Ignored unknown trigger: "${trigger}"`);
    return;
  }

  if (!phone) {
    console.log("[handleIncomingMessage] No phone provided");
    return;
  }
  if(!phone.startsWith("216")){
    console.log("[handleIncomingMessage] Not a tunisian number");
    return;

  }

  const seller: Seller | undefined = await getSellerByPhone(phone);

  if (!seller) {
    console.log(`[handleIncomingMessage] Seller not found for phone ${phone}`);
    return;
  }

  const active = await isSessionActive(seller.flow_token ?? "");

  if (!active) {
    console.log(`[handleIncomingMessage] Session expired for ${phone}, sending auth flow.`);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
      const authResponse = await fetch(`${baseUrl}${AUTH_FLOW_SEND_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller }),
      });

      const authData = await authResponse.json();
      console.log(`[handleIncomingMessage] Session inactive -> auth flow sent`, authData);
    } catch (error) {
      console.error(`[handleIncomingMessage] Failed to send auth flow for ${phone}:`, error);
    }

    return;
  }

  const endpoint = TRIGGER_TO_ENDPOINT[trigger];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller }),
    });

    const data = await response.json();
    console.log(`[handleIncomingMessage] "${trigger}" → ${endpoint}`, data);
  } catch (error) {
    console.error(`[handleIncomingMessage] Failed to call ${endpoint}:`, error);
  }
}



