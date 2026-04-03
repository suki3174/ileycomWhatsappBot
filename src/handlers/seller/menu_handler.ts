import { Seller } from "@/models/seller_model";
import {
  markInboundMessageSeen,
  markInboundTriggerSeen,
} from "@/services/cache/auth_cache_service";
import { getSellerByPhone, isSessionActive } from "@/services/auth_service";
import { getSellerPhoneCandidates, isTunisianPhone, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";

const MENU_TRIGGERS = new Set([
  "Voir mes commandes",
  "Voir mes produits",
  "Modifier un produit",
  "Créer un produit",
  "Creer un produit",
]);

const TRIGGER_TO_ENDPOINT: Record<string, string> = {
  "Voir mes commandes": "/api/seller/ordersFlow/send",
  "Voir mes produits": "/api/seller/productsFlow/send",
  "Modifier un produit": "/api/seller/updateProductFlow/send",
  "Créer un produit": "/api/seller/addProductFlow/send",
  "Creer un produit": "/api/seller/addProductFlow/send",
};

export async function handleIncomingMessage(
  phone: string,
  messageBody: string,
  options?: { messageId?: string; messageTimestamp?: string },
): Promise<void> {
  const trigger = messageBody.trim();
  const senderPhone = normalizeSellerPhone(phone);
  const messageId = String(options?.messageId || "").trim();

  if (messageId) {
    const alreadySeen = await markInboundMessageSeen(messageId);
    if (alreadySeen) {
      console.log(`[handleIncomingMessage] Duplicate message id ignored: ${messageId}`);
      return;
    }
  }

  const triggerAlreadySeen = await markInboundTriggerSeen(senderPhone, trigger);
  if (triggerAlreadySeen) {
    console.log(`[handleIncomingMessage] Trigger cooldown ignored: ${senderPhone}::${trigger}`);
    return;
  }

  if (!MENU_TRIGGERS.has(trigger)) {
    console.log(`[handleIncomingMessage] Ignored unknown trigger: "${trigger}"`);
    return;
  }

  if (!senderPhone) {
    console.log("[handleIncomingMessage] No phone provided");
    return;
  }
  if (!isTunisianPhone(senderPhone)) {
    console.log("[handleIncomingMessage] Not a tunisian number");
    return;

  }

  const phoneCandidates = getSellerPhoneCandidates(senderPhone);
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
    const authResult = await sendAuthFlowOnce({
      phone: senderPhone,
      seller,
      source: `menu-trigger:${trigger}`,
    });
    console.log(`[handleIncomingMessage] Session inactive auth dispatch result`, authResult);

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



