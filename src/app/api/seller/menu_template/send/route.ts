import { generateFlowtoken, normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { getSellerByPhone, prepareSellerState } from "@/services/auth_service";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {
    const body = await req.json();
    const phone = normalizeSellerPhone(String(body?.phone || ""));

    if (!phone) {
        return NextResponse.json({ error: "phone is required in request body" }, { status: 400 });
    }
    try {
        const sellerFromState = await getSellerByPhone(phone);
        const persistedToken = String(sellerFromState?.flow_token || "").trim();
        const token = persistedToken || generateFlowtoken(phone);
        if (!persistedToken) await prepareSellerState(token);
        const recipient = phone

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
                        name: "menu_template1",
                        language: { code: "fr" },
                        components: [
                            {
                                type: "button",
                                sub_type: "flow",
                                index: "0",
                                parameters: [
                                    {
                                        type: "action",
                                        action: { flow_token: token },
                                    },
                                ],
                            },
                        ],
                    },
                }),
            }
        );

       const data = await response.json();
    return NextResponse.json({ seller: phone, status: response.status, data });

  } catch (error) {
    console.error(`Error sending to ${phone}:`, error);
    return NextResponse.json({ seller: phone, error: "Failed to send" }, { status: 500 });
  }

}