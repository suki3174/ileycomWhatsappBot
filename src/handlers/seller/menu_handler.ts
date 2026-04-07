import { Seller } from "@/models/seller_model";
import {
  markInboundMessageSeen,
  markInboundTriggerSeen,
} from "@/services/cache/auth_cache_service";
import { validateSellerFlowDispatch } from "@/services/auth_service";
import { getSellerPhoneCandidates, isSupportedSellerPhone, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
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
  if (!isSupportedSellerPhone(senderPhone)) {
    console.log("[handleIncomingMessage] Unsupported phone country for this bot");
    return;

  }

  const phoneCandidates = getSellerPhoneCandidates(senderPhone);
  let authResult:
    | Awaited<ReturnType<typeof validateSellerFlowDispatch>>
    | undefined;
  for (const candidate of phoneCandidates) {
    authResult = await validateSellerFlowDispatch(candidate);
    if (authResult.ok || authResult.reason === "session-expired") break;
  }

  if (!authResult?.ok || !authResult.seller) {
    console.log(
      `[handleIncomingMessage] Authentication required for ${senderPhone} (reason=${authResult?.reason || "seller-not-found"})`,
    );
    const authDispatchResult = await sendAuthFlowOnce({
      phone: senderPhone,
      seller: authResult?.seller,
      source: `menu-trigger:${trigger}`,
    });
    console.log(`[handleIncomingMessage] Session inactive auth dispatch result`, authDispatchResult);

    return;
  }

  const seller: Seller = authResult.seller;

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



