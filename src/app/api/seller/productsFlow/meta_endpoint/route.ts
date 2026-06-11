import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/flow_crypto";
import { handleProductsFlow } from "@/handlers/seller/productsFlow_handler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

/*
This callback endpoint receives encrypted Meta flow events for productsFlow. It decrypts
the payload, enriches request context metadata used by downstream rendering, dispatches
screen actions to the products flow handler, and encrypts the response back to Meta.
Ping actions are handled inline to provide a lightweight liveness response.
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

      const host = req.headers.get("host") || "";
      const protoHeader = req.headers.get("x-forwarded-proto") || "";
      const reqProto = protoHeader || (req.nextUrl.protocol || "https:").replace(":", "");
      parsed.data = {
        ...(parsed.data || {}),
        __request_host: host,
        __request_proto: reqProto,
      };
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

/*
Lightweight health endpoint used for smoke checks and tunnel verification. It does not
participate in encrypted flow exchanges and simply confirms that the products callback
route is active and reachable.
*/
export async function GET(req: Request) {
  void req;
  return new Response("Products flow endpoint active", { status: 200 });
}
