import type { Seller } from "@/models/seller_model";
import { getSellerByPhone } from "@/services/auth_service";
import { markAuthPromptSeen } from "@/services/cache/auth_cache_service";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";

type AuthFlowOnceParams = {
  phone?: string;
  seller?: Partial<Seller>;
  source: string;
};

function toSellerPayload(phone: string, seller?: Partial<Seller>): Partial<Seller> {
  return {
    name: String(seller?.name || "Seller").trim() || "Seller",
    email: String(seller?.email || "").trim(),
    phone,
    flow_token: seller?.flow_token || null,
  };
}

export async function sendAuthFlowOnce(params: AuthFlowOnceParams): Promise<{ sent: boolean; reason: string }> {
  const normalizedPhone = normalizeSellerPhone(String(params.phone || params.seller?.phone || ""));
  if (!normalizedPhone) {
    return { sent: false, reason: "missing-phone" };
  }

  const duplicate = await markAuthPromptSeen(normalizedPhone);
  if (duplicate) {
    return { sent: false, reason: "deduped" };
  }

  const sellerFromState = await getSellerByPhone(normalizedPhone);
  const sellerPayload = toSellerPayload(normalizedPhone, sellerFromState || params.seller);

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/seller/authFlow/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller: sellerPayload, phone: normalizedPhone, source: params.source }),
    });

    if (!res.ok) {
      return { sent: false, reason: `auth-send-http-${res.status}` };
    }

    return { sent: true, reason: "sent" };
  } catch {
    return { sent: false, reason: "auth-send-error" };
  }
}
