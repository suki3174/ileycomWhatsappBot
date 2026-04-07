import { NextResponse } from "next/server";
import { handleIncomingMessage } from "@/handlers/seller/menu_handler";
import { isSupportedSellerPhone, normalizeSellerPhone } from "@/utils/seller_auth_helpers";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Verification failed", { status: 403 });
}

const MENU_TRIGGERS = new Set([
  "Voir mes commandes",
  "Voir mes produits",
  "Modifier un produit",
]);

function extractMenuTrigger(message: Record<string, any> | undefined): string {
  if (!message || typeof message !== "object") return "";

  const textBody = message?.text?.body;
  if (typeof textBody === "string" && textBody.trim()) return textBody.trim();

  const buttonText = message?.button?.text;
  if (typeof buttonText === "string" && buttonText.trim()) return buttonText.trim();

  const interactiveTitle =
    message?.interactive?.button_reply?.title ??
    message?.interactive?.list_reply?.title;
  if (typeof interactiveTitle === "string" && interactiveTitle.trim()) {
    return interactiveTitle.trim();
  }

  return "";
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const entry = body?.entry?.[0];                    
    const changes = entry?.changes?.[0];             
    const value = changes?.value;
    const messages = value?.messages;                  
    const message = messages?.[0];                     
    const messageBody = extractMenuTrigger(message); 
    const senderPhoneRaw = String(message?.from || "").trim();
    const isSupportedPhone = isSupportedSellerPhone(senderPhoneRaw);
    const senderPhone = isSupportedPhone ? normalizeSellerPhone(senderPhoneRaw) : "";
    const messageId = String(message?.id || "").trim();
    const messageTimestamp = String(message?.timestamp || "").trim();
    const messageType = message?.type;               


    if (messageBody && senderPhoneRaw) {
        if (!isSupportedPhone) {
          console.log(`[webhook] Ignored trigger from unsupported country phone: ${senderPhoneRaw}`);
          return NextResponse.json({ status: "ok" });
        }

        if (MENU_TRIGGERS.has(messageBody.trim())) {
          // Acknowledge webhook quickly; process trigger asynchronously to avoid
          // Meta retries that can duplicate flow sends.
          void handleIncomingMessage(senderPhone, messageBody, {
            messageId,
            messageTimestamp,
          });
        } else {
          console.log(`[webhook] Ignored message: "${messageBody}" (type=${messageType})`);
        }
    }
    
  } catch (err) {
    console.error("[webhook] Error processing message:", err);
  }

  return NextResponse.json({ status: "ok" });
}
