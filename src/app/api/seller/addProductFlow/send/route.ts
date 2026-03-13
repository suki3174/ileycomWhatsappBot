import { NextResponse } from "next/server";
import { getAllSellers } from "@/services/auth_service";
import { generateFlowtoken } from "@/utils/auth_utils";

export async function POST() {
  const sellers = getAllSellers();
  const results: {
    seller: string;
    recipient: string;
    status?: number;
    data?: unknown;
    error?: string;
  }[] = [];
  const recipient = String(process.env.TEST_PHONE_NUMBER || "").trim();

  if (!recipient) {
    return NextResponse.json(
      { error: "TEST_PHONE_NUMBER is not configured" },
      { status: 500 },
    );
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
            mode: "published",
            template: {
              name: "addproductflow_message_template",
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
      results.push({
        seller: String((seller as { name?: string }).name ?? ""),
        recipient,
        status: response.status,
        data,
      });
    } catch (error) {
      console.error(
        `Error sending to ${String(
          (seller as { name?: string }).name ?? "",
        )}:`,
        error,
      );
      results.push({
        seller: String((seller as { name?: string }).name ?? ""),
        recipient,
        error: "Failed to send",
      });
    }
  }

  return NextResponse.json({ summary: results }, { status: 200 });
}

