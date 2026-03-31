/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import { getAllSellers, getSellerByPhone, prepareSellerState } from "@/services/auth_service";
import { generateFlowtoken, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { extractPhoneFromFlowToken } from "@/utils/data_parser";

export async function  POST( req: NextRequest) {
 const body = await req.json();
   const seller: Seller = body.seller;
   const incomingPhone = normalizeSellerPhone(String(body?.phone || ""));
  
    if (!seller) {
      return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
    }
    try {
      const limited = seller.name.length > 50 ? seller.name.slice(0, 50) + "..." : seller.name;
      const sellerPhone = normalizeSellerPhone(String(seller?.phone || ""));
      const recipient = incomingPhone || sellerPhone;
      if (!recipient) {
        return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
      }

      const sellerFromState = await getSellerByPhone(recipient);
      const persistedToken = String(sellerFromState?.flow_token || "").trim();
      const persistedPhone = extractPhoneFromFlowToken(persistedToken || "") || "";
      const tokenMatchesPhone = !!persistedToken && persistedPhone === recipient;
      const token = tokenMatchesPhone ? persistedToken : generateFlowtoken(recipient);
      if (!tokenMatchesPhone) await prepareSellerState(token);

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
            template: {
              name: "authflowseller_message",
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
    return NextResponse.json({ seller: seller.name, recipient, status: response.status, data });

  } catch (error) {
    console.error(`Error sending to ${seller.name}:`, error);
    return NextResponse.json({ seller: seller.name, error: "Failed to send" }, { status: 500 });
  }
}