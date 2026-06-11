import { NextRequest, NextResponse } from "next/server";
import { getSellerByPhone, prepareSellerState } from "@/services/auth_service";
import { areEquivalentSellerPhones, generateFlowtoken, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { extractPhoneFromFlowToken } from "@/utils/data_parser";

const SELLER_LOOKUP_TIMEOUT_MS = 1500;
const GRAPH_SEND_TIMEOUT_MS = 8000;

/**
 * Resolves a promise with a fallback value when it takes too long or throws.
 * This keeps non-critical lookups bounded so the send endpoint stays responsive
 * even when downstream services are slow or temporarily unavailable.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  try {
    const timer = new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    });
    return await Promise.race([promise, timer]);
  } catch {
    return fallback;
  }
}

/**
 * Sends the auth flow template to WhatsApp after validating recipient context
 * and enforcing that seller state exists for the chosen flow token. The handler
 * returns delivery metadata and elapsed time, and fails fast with a 409 when
 * state insertion cannot be confirmed.
 */
export async function  POST( req: NextRequest) {
  let sellerNameForLogs = "unknown";
  const startedAt = Date.now();
  try {
    const body = await req.json();
   const seller: Seller = body.seller;
   const incomingPhone = normalizeSellerPhone(String(body?.phone || ""));
  
    if (!seller) {
      return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
    }
      const sellerName = String(seller?.name || "").trim();
      const limited = sellerName.length > 50 ? sellerName.slice(0, 50) + "..." : sellerName;
      sellerNameForLogs = sellerName || "unknown";
      const sellerPhone = normalizeSellerPhone(String(seller?.phone || ""));
      const recipient = incomingPhone || sellerPhone;
      if (!recipient) {
        return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
      }

      // Keep endpoint responsive: phone lookup is best-effort and short-lived.
      const sellerFromState = await withTimeout(
        getSellerByPhone(recipient),
        SELLER_LOOKUP_TIMEOUT_MS,
        undefined,
      );
      const persistedToken = String(sellerFromState?.flow_token || "").trim();
      const persistedPhone = extractPhoneFromFlowToken(persistedToken || "") || "";
      const tokenMatchesPhone = !!persistedToken && areEquivalentSellerPhones(persistedPhone, recipient);
      const token = tokenMatchesPhone ? persistedToken : generateFlowtoken(recipient);

      // Hard gate: do not send auth flow template until seller state insert is confirmed.
      const stateReady = await prepareSellerState(token);
      if (!stateReady) {
        return NextResponse.json(
          {
            seller: sellerNameForLogs,
            recipient,
            error: "Seller state is not ready yet. Auth flow was not sent.",
            elapsedMs: Date.now() - startedAt,
          },
          { status: 409 },
        );
      }

      const response = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          signal: AbortSignal.timeout(GRAPH_SEND_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template: {
              name: "auth_flow_local",
              language: { code: "fr" },
              components: [
                {
                  type: "header",
                  parameters: [
                    {
                      type: "text",
                      parameter_name: "seller_name", 
                      text: limited || "Vendeur"
                    },
                  ],
                },
                {
                  type: "button",
                  sub_type: "flow",
                  index: "0",
                  parameters: [
                    {
                      type: "action",
                      action: {
                        flow_token: token,
                      },
                    },
                  ],
                },
              ],
            },
          }),
        }
      );
       const data = await response.json();
    return NextResponse.json({
      seller: sellerNameForLogs,
      recipient,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      data,
    });

  } catch (error) {
    console.error(`Error sending to ${sellerNameForLogs}:`, error);
    return NextResponse.json(
      {
        seller: sellerNameForLogs,
        error: "Failed to send",
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}