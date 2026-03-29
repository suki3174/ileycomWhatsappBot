import { generateFlowtoken } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { NextRequest, NextResponse } from "next/server";
import { getSellerByPhone, prepareSellerState } from "@/services/auth_service";

export async function POST(req:NextRequest) { 
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch (error) {
    console.error("updateProductFlow/send invalid json body", error);
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const candidate = (body.seller ?? body.phone ?? body) as Partial<Seller> | undefined;
  const seller = candidate && typeof candidate === "object"
    ? candidate as Seller
    : undefined;

  if (!seller) {
    return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
  }
  if (!seller.phone) {
    return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
  }
    try {
      const sellerFromState = await getSellerByPhone(seller.phone);
      const persistedToken = String(sellerFromState?.flow_token || "").trim();
      const token = persistedToken || generateFlowtoken(seller.phone);
      if (!persistedToken) await prepareSellerState(token);
      const recipient = seller.phone
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
              name: "updateproductflow_message",
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
        },
      );
      const data = await response.json();
      return NextResponse.json({
        seller: seller.name,
        recipient: seller.phone,
        status: response.status,
        flow_token_used: token,
        data,
      });
  
    } catch (error) {
      console.error(`Error sending to ${seller.name}:`, error);
      return NextResponse.json({ seller: seller.name, error: "Failed to send" }, { status: 500 });
    }

}