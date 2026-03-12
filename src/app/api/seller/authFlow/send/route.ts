/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import { getAllSellers } from "@/services/auth_service";
import { generateFlowtoken } from "@/utils/auth_utils";

export async function POST( req: NextRequest) {
  const sellers = getAllSellers();
  const results = [];
  const recipient = String(process.env.TEST_PHONE_NUMBER || "").trim();

  if (!recipient) {
    return NextResponse.json({ error: "TEST_PHONE_NUMBER is not configured" }, { status: 500 });
  }

  for (const seller of sellers) {
    try {
      const deliverySeller = { ...seller, phone: recipient };
      const token = generateFlowtoken(deliverySeller);

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
                      text: seller.name || "Vendeur"
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
      results.push({ seller: seller.name, recipient, status: response.status, data });

    } catch (error) {
      console.error(`Error sending to ${seller.name}:`, error);
      results.push({ seller: seller.name, recipient, error: "Failed to send" });
    }
  }

  return NextResponse.json({ summary: results }, { status: 200 });
}