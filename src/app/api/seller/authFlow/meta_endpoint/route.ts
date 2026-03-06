import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/crypto";
import { handleAuthFlow } from "@/handlers/seller/auth_flowHandler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

export async function POST(req: NextRequest) {
  try {
    console.log("Flow POST received", {
      url: req.url,
      host: req.headers.get("host"),
      forwarded: req.headers.get("x-forwarded-for"),
    });

    const body = await req.json();
    console.log("Flow POST body keys:", Object.keys(body));

    let parsed: FlowRequest;
    let aesKey: Buffer;
    let iv: Buffer;
    try {
      const dec = decryptFlowPayload<FlowRequest>(body);
      parsed = dec.parsed;
      aesKey = dec.aesKey;
      iv = dec.iv;
      console.log("Decrypted flow payload:", {
        action: parsed.action,
        version: parsed.version,
        flow_token: parsed?.data?.flow_token ?? parsed?.flow_token,
        screen: parsed.screen,
      });
    } catch (deErr: unknown) {
      const err =
        typeof deErr === "object" && deErr !== null && "message" in deErr
          ? (deErr as { message?: string })
          : {};
      console.error("Flow decryption failed:", err.message || deErr);
      // Per Meta docs: if request cannot be decrypted, return 421 so client can re-download public key
      const msg = String(err.message || "Unable to decrypt payload");
      return new Response(msg, { status: 421 });
    }

    let resp: FlowResponse | { data: { status: string } };
    if (parsed.action === "ping" || parsed.action === "PING") {
      resp = { data: { status: "active" } };
    } else {
      const flowResponse = await handleAuthFlow(parsed);
       
      resp = {
  
        screen: flowResponse.screen,
        data: flowResponse.data,
      };
      console.log("Flow response prepared:", {
        screen: resp.screen,
        data: resp.data,
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

    console.error("Flow processing error:", e.message || err);

    const msg = String(e.message || "Unable to process flow");
    const status =
      msg.includes("Missing") || msg.includes("Invalid") ? 400 : 500;

    return new Response(msg, { status });
  }
}

export async function GET(req: Request) {
  console.log(
    "Flow GET ping from",
    req.headers.get ? req.headers.get("x-forwarded-for") : "unknown",
  );
  return new Response("Flow endpoint active", { status: 200 });
}
