import { Seller } from "@/models/seller_model";
import { findSellerByTokenOrPhone, isSessionActive } from "@/services/auth_service";
import { extractPhoneFromFlowToken } from "@/utils/repository_utils";




const MENU_TRIGGERS = new Set([
  "Voir mes commandes",
  "Voir mes produits",
  "Modifier un produit",
]);

const TRIGGER_TO_ENDPOINT: Record<string, string> = {
  "Voir mes commandes": "/api/seller/ordersFlow/send",
  "Voir mes produits": "/api/seller/productsFlow/send",
  "Modifier un produit": "/api/seller/updateProduct/send",
};


export async function handleIncomingMessage(
  token: string,
  messageBody: string
): Promise<void> {
  const trigger = messageBody.trim();

  // 1. Guard: only handle known menu triggers
  if (!MENU_TRIGGERS.has(trigger)) {
    console.log(`[handleIncomingMessage] Ignored unknown trigger: "${trigger}"`);
    return;
  }

  const phone = extractPhoneFromFlowToken(token);

  if (!phone) {
    // handle null — extractPhoneFromFlowToken returned null
    console.log("menu handler, invalid token")
    return;
  }

  const seller: Seller | undefined = await findSellerByTokenOrPhone(phone);

const active=isSessionActive(token)

  if (!active) {
    console.log(`[sendMenu] Session expired for ${token}, skipping flow.`);
    return;
  }
  if (!seller) {
    console.log("menu handler,can't find seller")
  }
  // 3. Resolve the target endpoint
  const endpoint = TRIGGER_TO_ENDPOINT[trigger];

  // 4. Forward the request to the appropriate flow endpoint
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



