import { Seller } from "@/models/seller_model";
import {
  markInboundMessageSeen,
  markInboundTriggerSeen,
} from "@/services/cache/auth_cache_service";
import { validateSellerFlowDispatch } from "@/services/auth_service";
import { getSellerPhoneCandidates, isSupportedSellerPhone, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";

const NORMALIZED_TRIGGER_TO_ENDPOINT: Record<string, string> = {
  "voir mes commandes": "/api/seller/ordersFlow/send",
  "voir mes commandes1": "/api/seller/ordersFlow/send",
  "voir mes produits": "/api/seller/productsFlow/send",
  "voir mes produits1": "/api/seller/productsFlow/send",
  "modifier un produit": "/api/seller/updateProductFlow/send",
  "modifier un produit1": "/api/seller/updateProductFlow/send",
  "creer un produit": "/api/seller/addProductFlow/send",
  "creer un produit1": "/api/seller/addProductFlow/send",
};

function normalizeTrigger(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function isMenuTrigger(raw: string): boolean {
  const normalized = normalizeTrigger(raw);
  return Boolean(normalized && NORMALIZED_TRIGGER_TO_ENDPOINT[normalized]);
}

export type MenuDispatchResult = {
  ok: boolean;
  stage:
    | "received"
    | "dedupe-message"
    | "dedupe-trigger"
    | "unknown-trigger"
    | "missing-phone"
    | "unsupported-phone"
    | "auth-required"
    | "dispatch"
    | "dispatch-error"
    | "unexpected-error";
  reason: string;
  normalizedTrigger?: string;
  endpoint?: string;
  senderPhone?: string;
  responseStatus?: number;
};

export async function handleIncomingMessage(
  phone: string,
  messageBody: string,
  options?: { messageId?: string; messageTimestamp?: string },
): Promise<MenuDispatchResult> {
  try {
    const trigger = messageBody.trim();
    const normalizedTrigger = normalizeTrigger(trigger);
    const senderPhone = normalizeSellerPhone(phone);
    const messageId = String(options?.messageId || "").trim();

    console.log("[handleIncomingMessage] Received", {
      trigger,
      normalizedTrigger,
      senderPhone,
      messageId,
      messageTimestamp: String(options?.messageTimestamp || "").trim(),
      hasEndpoint: Boolean(normalizedTrigger && NORMALIZED_TRIGGER_TO_ENDPOINT[normalizedTrigger]),
    });

    if (messageId) {
      const alreadySeen = await markInboundMessageSeen(messageId);
      if (alreadySeen) {
        console.log(`[handleIncomingMessage] Duplicate message id ignored: ${messageId}`);
        return {
          ok: false,
          stage: "dedupe-message",
          reason: "duplicate-message-id",
          normalizedTrigger,
          senderPhone,
        };
      }
    }

    const triggerAlreadySeen = await markInboundTriggerSeen(senderPhone, normalizedTrigger || trigger);
    if (triggerAlreadySeen) {
      console.log(`[handleIncomingMessage] Trigger cooldown ignored: ${senderPhone}::${normalizedTrigger || trigger}`);
      return {
        ok: false,
        stage: "dedupe-trigger",
        reason: "trigger-cooldown",
        normalizedTrigger,
        senderPhone,
      };
    }

    if (!normalizedTrigger || !NORMALIZED_TRIGGER_TO_ENDPOINT[normalizedTrigger]) {
      console.log(`[handleIncomingMessage] Ignored unknown trigger: "${trigger}"`);
      return {
        ok: false,
        stage: "unknown-trigger",
        reason: "not-mapped",
        normalizedTrigger,
        senderPhone,
      };
    }

    if (!senderPhone) {
      console.log("[handleIncomingMessage] No phone provided");
      return {
        ok: false,
        stage: "missing-phone",
        reason: "phone-normalization-failed",
        normalizedTrigger,
      };
    }
    if (!isSupportedSellerPhone(senderPhone)) {
      console.log("[handleIncomingMessage] Unsupported phone country for this bot", { senderPhone });
      return {
        ok: false,
        stage: "unsupported-phone",
        reason: "unsupported-country-or-format",
        normalizedTrigger,
        senderPhone,
      };

    }

    const phoneCandidates = getSellerPhoneCandidates(senderPhone);
    console.log("[handleIncomingMessage] Phone candidates", { senderPhone, phoneCandidates });
    let authResult:
      | Awaited<ReturnType<typeof validateSellerFlowDispatch>>
      | undefined;
    for (const candidate of phoneCandidates) {
      authResult = await validateSellerFlowDispatch(candidate);
      console.log("[handleIncomingMessage] Auth candidate result", {
        candidate,
        ok: authResult.ok,
        reason: authResult.reason,
        hasSeller: Boolean(authResult.seller),
      });
      if (authResult.ok || authResult.reason === "session-expired") break;
    }

    if (!authResult?.ok || !authResult.seller) {
      console.log(
        `[handleIncomingMessage] Authentication required for ${senderPhone} (reason=${authResult?.reason || "seller-not-found"})`,
      );
      const authDispatchResult = await sendAuthFlowOnce({
        phone: senderPhone,
        seller: authResult?.seller,
        source: `menu-trigger:${normalizedTrigger}`,
      });
      console.log(`[handleIncomingMessage] Session inactive auth dispatch result`, authDispatchResult);

      return {
        ok: false,
        stage: "auth-required",
        reason: authResult?.reason || "seller-not-found",
        normalizedTrigger,
        senderPhone,
      };
    }

    const seller: Seller = authResult.seller;

    const endpoint = NORMALIZED_TRIGGER_TO_ENDPOINT[normalizedTrigger];

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

      console.log("[handleIncomingMessage] Dispatching endpoint", {
        trigger,
        normalizedTrigger,
        endpoint,
        baseUrl,
        senderPhone,
      });

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller, phone: senderPhone }),
      });

      const data = await response.json();
      console.log(`[handleIncomingMessage] "${trigger}" → ${endpoint}`, {
        httpStatus: response.status,
        data,
      });
      return {
        ok: response.ok,
        stage: "dispatch",
        reason: response.ok ? "flow-send-dispatched" : "flow-send-http-error",
        normalizedTrigger,
        endpoint,
        senderPhone,
        responseStatus: response.status,
      };
    } catch (error) {
      console.error(`[handleIncomingMessage] Failed to call ${endpoint}:`, error);
      return {
        ok: false,
        stage: "dispatch-error",
        reason: "dispatch-fetch-threw",
        normalizedTrigger,
        endpoint,
        senderPhone,
      };
    }
  } catch (error) {
    console.error("[handleIncomingMessage] Unexpected failure", {
      error,
      phone,
      messageBody,
    });
    return {
      ok: false,
      stage: "unexpected-error",
      reason: "unhandled-handler-error",
      normalizedTrigger: normalizeTrigger(messageBody),
      senderPhone: normalizeSellerPhone(phone),
    };
  }
}



