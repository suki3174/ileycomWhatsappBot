import { NextRequest, NextResponse } from "next/server";
import { normalizeSellerPhone } from "@/utils/seller_auth_helpers";
import { Seller } from "@/models/seller_model";
import { validateSellerFlowDispatch } from "@/services/auth_service";
import { sendAuthFlowOnce } from "@/services/auth_flow_guard_service";
import { clearAddProductState, updateAddProductState } from "@/repositories/addProduct/add_product_cache";
import { getProductCategoriesCached } from "@/services/add_product_service";

/**
 * Sends the add-product flow template to the seller after auth dispatch checks.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const seller: Seller = body.seller;

  if (!seller) {
    return NextResponse.json({ error: "seller is required in request body" }, { status: 400 });
  }


  try {
    const sellerPhone = normalizeSellerPhone(String(seller?.phone || ""));
    if (!sellerPhone) {
      return NextResponse.json({ error: "seller.phone is required in request body" }, { status: 400 });
    }

    const auth = await validateSellerFlowDispatch(sellerPhone);
    if (!auth.ok || !auth.seller) {
      await sendAuthFlowOnce({
        phone: sellerPhone,
        seller: auth.seller || seller,
        source: auth.reason === "session-expired"
          ? "send-route:add-product:session-expired"
          : "send-route:add-product:seller-not-found",
      });
      return NextResponse.json(
        { error: auth.reason === "session-expired" ? "Session expired. Please sign in again." : "Authentication required. Please sign in first." },
        { status: 401 },
      );
    }
    const token = auth.token;

    // Prime add-product state at send-time so category screen uses live plugin taxonomy.
    await clearAddProductState(token);
    try {
      const categories = await getProductCategoriesCached();
      await updateAddProductState(token, {
        categories: Array.isArray(categories) ? categories : [],
        subcategories: {},
      });
      console.info("[AddProductFlow][send] primed categories", {
        tokenSuffix: token.length > 8 ? token.slice(-8) : token,
        count: Array.isArray(categories) ? categories.length : 0,
      });
    } catch (err) {
      console.warn("[AddProductFlow][send] category prewarm failed", err);
      await updateAddProductState(token, { subcategories: {} });
    }

    const recipient = sellerPhone;
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
            name: "add_product_flow_local",
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
    return NextResponse.json({ seller: seller.name, recipient, status: response.status, data });

  } catch (error) {
    console.error(`Error sending to ${seller.name}:`, error);
    return NextResponse.json({ seller: seller.name, error: "Failed to send" }, { status: 500 });
  }

}

/**
 * Add-product send route does not expose a GET operation.
 * This API is intentionally write-only to dispatch template launches.
 */

