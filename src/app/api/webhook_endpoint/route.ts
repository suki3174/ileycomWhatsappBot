import { NextResponse } from "next/server";
import { handleIncomingMessage } from "@/handlers/seller/menu_handler";

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

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const entry = body?.entry?.[0];                    
    const changes = entry?.changes?.[0];             
    const value = changes?.value;
    const messages = value?.messages;                  
    const message = messages?.[0];                     
    const messageBody = message?.text?.body;          
    const senderPhone = message?.from; 
    const messageType = message?.type;               


    if (messageBody && senderPhone) {

        if (messageType=== "text" && messageBody) {
          if (MENU_TRIGGERS.has(messageBody.trim())) {
            await handleIncomingMessage(senderPhone, messageBody);
          } else {
            console.log(`[webhook] Ignored message: "${messageBody}"`);
          }
        }
      }
    
  } catch (err) {
    console.error("[webhook] Error processing message:", err);
  }

  return NextResponse.json({ status: "ok" });
}
