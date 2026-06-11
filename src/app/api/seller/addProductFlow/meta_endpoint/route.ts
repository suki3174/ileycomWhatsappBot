import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/flow_crypto";
import { handleAddProductFlow } from "@/handlers/seller/addProductFlow_handler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

/**
 * Decrypts, routes, and re-encrypts add-product flow callback payloads from Meta.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.info("[AddProductFlow][meta] request:received", {
      bodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
    });

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
      console.error(
        "Add-product flow decryption failed:",
        err.message || deErr,
      );
      const msg = String(err.message || "Unable to decrypt payload");
      return new Response(msg, { status: 421 });
    }

    let resp: FlowResponse | { data: { status: string } };
    if (parsed.action === "ping" || parsed.action === "PING") {
      console.info("[AddProductFlow][meta] request:ping", {
        action: parsed.action,
      });
      resp = { data: { status: "active" } };
    } else {
      console.info("[AddProductFlow][meta] request:decrypted", {
        action: parsed.action ?? "",
        screen: parsed.screen ?? "",
        version: parsed.version ?? "",
        dataKeys: parsed.data ? Object.keys(parsed.data) : [],
      });
      const flowResponse = await handleAddProductFlow(parsed);
      if (!flowResponse) {
        return new Response("No content", { status: 200 });
      }
      console.info("[AddProductFlow][meta] response:flow", {
        screen: flowResponse.screen,
        dataKeys: flowResponse.data ? Object.keys(flowResponse.data) : [],
      });
      resp = {
        screen: flowResponse.screen,
        data: flowResponse.data,
      };
    }

    const encoded = encryptFlowResponse(resp, aesKey, iv);

    return new Response(encoded, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err: unknown) {
    const e =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message?: string })
        : {};

    console.error("Add-product flow processing error:", e.message || err);

    const msg = String(e.message || "Unable to process add-product flow");
    const status =
      msg.includes("Missing") || msg.includes("Invalid") ? 400 : 500;

    return new Response(msg, { status });
  }
}

/**
 * Simple health endpoint used by Meta callback validation and smoke tests.
 */
export async function GET(_req: Request) {
  return new Response("Add-product flow endpoint active", { status: 200 });
}

