import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/flow_crypto";
import { handleUpdateProductFlow } from "@/handlers/seller/updateProductFlow_handler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

/**
 * Handles encrypted WhatsApp Flow callbacks for update-product execution.
 * The function decrypts payloads, responds to health pings, dispatches runtime
 * actions to the update flow handler, and re-encrypts the resulting screen data
 * to satisfy Meta's secure flow transport contract.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let parsed: FlowRequest;
    let aesKey: Buffer;
    let iv: Buffer;
    try {
      const dec = decryptFlowPayload<FlowRequest>(body);
      parsed = dec.parsed;
      aesKey = dec.aesKey;
      iv = dec.iv;
    } catch (deErr: unknown) {
      const err =
        typeof deErr === "object" && deErr !== null && "message" in deErr
          ? (deErr as { message?: string })
          : {};
      const msg = String(err.message || "Unable to decrypt payload");
      return new Response(msg, { status: 421 });
    }

    let resp: FlowResponse | { data: { status: string } };
    if (parsed.action === "ping" || parsed.action === "PING") {
      resp = { data: { status: "active" } };
    } else {
      const flowResponse = await handleUpdateProductFlow(parsed);
      if (!flowResponse) return new Response("No content", { status: 200 });
      resp = { screen: flowResponse.screen, data: flowResponse.data };
    }

    const encoded = encryptFlowResponse(resp, aesKey, iv);
    return new Response(encoded, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response("Unable to process update product flow", { status: 500 });
  }
}

/**
 * Lightweight health probe used by deployment and manual smoke checks to verify
 * the update-product callback route is reachable before encrypted flow traffic.
 */
export async function GET() {
  return new Response("Update product flow endpoint active", { status: 200 });
}

