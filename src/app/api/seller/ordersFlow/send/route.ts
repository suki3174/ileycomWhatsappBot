import { NextRequest, NextResponse } from "next/server";
import { generateFlowtoken } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { getSellerByPhone, isSessionActive } from "@/services/auth_service";

export async function POST(req: NextRequest) {
 
  const body = await req.json();
    const seller: Seller = body.seller;

    if (!seller) {
        return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
    }

    try {
      const recipient = seller.phone

      const sellerFromState = await getSellerByPhone(seller.phone);
      const persistedToken = String(sellerFromState?.flow_token || "").trim();
      const token = persistedToken || generateFlowtoken(seller.phone);
      if (!persistedToken) {
        return NextResponse.json(
          { error: "Session inactive. Please sign in first." },
          { status: 401 },
        );
      }

      const active = await isSessionActive(token);
      if (!active) {
        return NextResponse.json(
          { error: "Session expired. Please sign in again." },
          { status: 401 },
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
              name: "ordersflow",
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
      return NextResponse.json({ seller: seller.name, recipient: seller.phone, status: response.status, data });
  
    } catch (error) {
      console.error(`Error sending to ${seller.name}:`, error);
      return NextResponse.json({ seller: seller.name, error: "Failed to send" }, { status: 500 });
    }
}