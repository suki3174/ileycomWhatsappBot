import { NextRequest, NextResponse } from "next/server";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { validateSellerFlowDispatch } from "@/services/auth_service";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";

/*
This endpoint launches the products WhatsApp flow template for a seller. It validates
the incoming body, resolves the seller phone, enforces the auth/session dispatch guard,
and sends the Meta template with the current flow token when authorized. If the seller
session is invalid or expired, it triggers the auth fallback flow and returns 401.
*/
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch (error) {
    console.error("productsFlow/send invalid json body", error);
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const candidate = (body.seller ?? body.phone ?? body) as Partial<Seller> | undefined;
  const seller = candidate && typeof candidate === "object"
    ? candidate as Seller
    : undefined;
  const rawSenderPhone = normalizeSellerPhone(String(body.phone || ""));

  if (!seller) {
    return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
  }
  const sellerPhone = normalizeSellerPhone(String(seller.phone || "")) || rawSenderPhone;
  if (!sellerPhone) {
    return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
  }

  console.log("[productsFlow/send] Request accepted", {
    sellerPhone,
    rawSenderPhone,
    sellerName: String(seller.name || ""),
  });


  try {
    const auth = await validateSellerFlowDispatch(sellerPhone);
    if (!auth.ok || !auth.seller) {
      console.log("[productsFlow/send] Auth blocked send", {
        sellerPhone,
        reason: auth.reason,
        hasSeller: Boolean(auth.seller),
      });
      await sendAuthFlowOnce({
        phone: sellerPhone,
        seller: auth.seller || seller,
        source: auth.reason === "session-expired"
          ? "send-route:products:session-expired"
          : "send-route:products:seller-not-found",
      });
      return NextResponse.json(
        { error: auth.reason === "session-expired" ? "Session expired. Please sign in again." : "Authentication required. Please sign in first." },
        { status: 401 },
      );
    }
    const token = auth.token;
    const recipient = rawSenderPhone || sellerPhone;
    console.log("[productsFlow/send] Sending Meta template", {
      recipient,
      tokenPreview: String(token || "").slice(0, 24),
    });

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
            name: "products_flow_local",
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
    console.log("[productsFlow/send] Meta response", {
      status: response.status,
      recipient,
      data,
    });
    return NextResponse.json({ seller: seller.name, recipient, status: response.status, data });

  } catch (error) {
    console.error(`Error sending to ${seller.name}:`, error);
    return NextResponse.json({ seller: seller.name, error: "Failed to send" }, { status: 500 });
  }
}
