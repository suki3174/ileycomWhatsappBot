import { NextRequest, NextResponse } from "next/server";
import { areEquivalentSellerPhones, generateFlowtoken, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { getSellerByPhone, isSessionActive, prepareSellerState } from "@/services/auth_service";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";
import { extractPhoneFromFlowToken } from "@/utils/data_parser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const seller: Seller = body.seller;

  if (!seller) {
    return NextResponse.json(
      { error: "seller is required in request body" },
      { status: 400 }
    );
  }

  try {
    const sellerPhone = normalizeSellerPhone(String(seller?.phone || ""));
    if (!sellerPhone) {
      return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
    }
    const recipient = sellerPhone;

    const sellerFromState = await getSellerByPhone(sellerPhone);
    const persistedToken = String(sellerFromState?.flow_token || "").trim();
    const persistedPhone = extractPhoneFromFlowToken(persistedToken || "") || "";
    const tokenMatchesPhone = !!persistedToken && areEquivalentSellerPhones(persistedPhone, sellerPhone);
    const token = tokenMatchesPhone ? persistedToken : generateFlowtoken(sellerPhone);

    if (!tokenMatchesPhone) {
      await sendAuthFlowOnce({
        phone: sellerPhone,
        seller,
        source: "send-route:optimized-product:token-mismatch",
      });
      return NextResponse.json(
        { error: "Session inactive. Please sign in first." },
        { status: 401 },
      );
    }
    
    // Prepare seller state if no persisted token
    if (!persistedToken) {
      await prepareSellerState(token);
    }

    const active = await isSessionActive(token);
    if (!active) {
      await sendAuthFlowOnce({
        phone: sellerPhone,
        seller,
        source: "send-route:optimized-product:session-expired",
      });
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 }
      );
    }

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          mode: "published",
          template: {
            name: "optimizedproductflow_message_template",
            language: { code: "fr" },
            components: [
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
      seller: seller.name,
      recipient,
      status: response.status,
      data,
    });
  } catch (error) {
    console.error(`Error sending optimized product flow to ${seller.name}:`, error);
    return NextResponse.json(
      { seller: seller.name, error: "Failed to send" },
      { status: 500 }
    );
  }
}