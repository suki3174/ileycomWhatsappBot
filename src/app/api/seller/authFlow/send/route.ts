import { NextRequest, NextResponse } from "next/server";
import { generateFlowtoken, getAllSellers } from "@/services/auth_service";

export async function POST(req: NextRequest) {
  const sellers = getAllSellers();
  const results = [];

  for (const seller of sellers) {
    try {
      // 1. Generate the unique token for THIS specific seller
      const token = generateFlowtoken(seller);
      console.log(seller)

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
            to: seller.phone, // 🔹 Corrected to use current seller's phone
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
      results.push({ seller: seller.name, status: response.status, data });

    } catch (error) {
      console.error(`Error sending to ${seller.name}:`, error);
      results.push({ seller: seller.name, error: "Failed to send" });
    }
  }

  return NextResponse.json({ summary: results }, { status: 200 });
}