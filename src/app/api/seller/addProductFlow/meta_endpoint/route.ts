import { NextRequest } from "next/server";
import { decryptFlowPayload, encryptFlowResponse } from "@/utils/crypto";
import { handleAddProductFlow } from "@/handlers/seller/addProductFlow_handler";
import type { FlowRequest } from "@/models/flowRequest";
import type { FlowResponse } from "@/models/flowResponse";

export async function POST(req: NextRequest) {
  try {
    console.log("AddProduct Flow POST received", {
      url: req.url,
      host: req.headers.get("host"),
      forwarded: req.headers.get("x-forwarded-for"),
    });

    const body = await req.json();
    console.log("AddProduct Flow POST body keys:", Object.keys(body));

    let parsed: FlowRequest;
    let aesKey: Buffer;
    let iv: Buffer;
    try {
      const dec = decryptFlowPayload<FlowRequest>(body);
      parsed = dec.parsed;
      aesKey = dec.aesKey;
      iv = dec.iv;
      console.log("Decrypted add-product flow payload:", {
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
      console.error(
        "Add-product flow decryption failed:",
        err.message || deErr,
      );
      const msg = String(err.message || "Unable to decrypt payload");
      return new Response(msg, { status: 421 });
    }

    let resp: FlowResponse | { data: { status: string } };
    if (parsed.action === "ping" || parsed.action === "PING") {
      resp = { data: { status: "active" } };
    } else {
      const flowResponse = await handleAddProductFlow(parsed);
      if (!flowResponse) {
        return new Response("No content", { status: 200 });
      }
      resp = {
        screen: flowResponse.screen,
        data: flowResponse.data,
      };
      console.log("Add-product flow response prepared:", {
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

    console.error("Add-product flow processing error:", e.message || err);

    const msg = String(e.message || "Unable to process add-product flow");
    const status =
      msg.includes("Missing") || msg.includes("Invalid") ? 400 : 500;

    return new Response(msg, { status });
  }
}

export async function GET(req: Request) {
  console.log(
    "AddProduct Flow GET ping from",
    req.headers instanceof Headers
      ? req.headers.get("x-forwarded-for")
      : "unknown",
  );
  return new Response("Add-product flow endpoint active", { status: 200 });
}

