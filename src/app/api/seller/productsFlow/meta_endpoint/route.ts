import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/flow_crypto";
import { handleProductsFlow } from "@/handlers/seller/productsFlow_handler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

export async function POST(req: NextRequest) {
  try {
    console.log("Products Flow POST received", {
      url: req.url,
      host: req.headers.get("host"),
      forwarded: req.headers.get("x-forwarded-for"),
    });

    const body = await req.json();
    console.log("Products Flow POST body keys:", Object.keys(body));

    let parsed: FlowRequest;
    let aesKey: Buffer;
    let iv: Buffer;
    try {
      const dec = decryptFlowPayload<FlowRequest>(body);
      parsed = dec.parsed;
      aesKey = dec.aesKey;
      iv = dec.iv;

      const host = req.headers.get("host") || "";
      const protoHeader = req.headers.get("x-forwarded-proto") || "";
      const reqProto = protoHeader || (req.nextUrl.protocol || "https:").replace(":", "");
      parsed.data = {
        ...(parsed.data || {}),
        __request_host: host,
        __request_proto: reqProto,
      };

      console.log("Decrypted products flow payload:", {
        action: parsed.action,
        version: parsed.version,
        flow_token: parsed?.data?.flow_token ?? parsed?.flow_token,
        screen: parsed.screen,
        data: parsed?.data || {},
      });
    } catch (deErr: unknown) {
      const err =
        typeof deErr === "object" && deErr !== null && "message" in deErr
          ? (deErr as { message?: string })
          : {};
      console.error("Products flow decryption failed:", err.message || deErr);
      const msg = String(err.message || "Unable to decrypt payload");
      return new Response(msg, { status: 421 });
    }

    let resp: FlowResponse | { data: { status: string } };
    if (parsed.action === "ping" || parsed.action === "PING") {
      resp = { data: { status: "active" } };
    } else {
      const flowResponse = await handleProductsFlow(parsed);
      if(!flowResponse){
        return new Response("No content", { status: 200});
      }
      resp = {
        screen: flowResponse.screen,
        data: flowResponse.data,
      };
      console.log("Products flow response prepared:", {
        screen: flowResponse.screen,
        data: flowResponse.data,
      });
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

    console.error("Products flow processing error:", e.message || err);

    const msg = String(e.message || "Unable to process products flow");
    const status =
      msg.includes("Missing") || msg.includes("Invalid") ? 400 : 500;

    return new Response(msg, { status });
  }
}

export async function GET(req: Request) {
  console.log(
    "Products Flow GET ping from",
    req.headers instanceof Headers
      ? req.headers.get("x-forwarded-for")
      : "unknown",
  );
  return new Response("Products flow endpoint active", { status: 200 });
}
