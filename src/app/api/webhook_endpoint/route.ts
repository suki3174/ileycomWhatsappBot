// app/api/webhook/route.ts
import { NextResponse } from 'next/server';

const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // Must match Meta Dashboard

// 1. Verification Handshake (GET)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return new NextResponse(challenge, { status: 200 });
  }
  
  return new NextResponse('Verification failed', { status: 403 });
}

// 2. Receive Notifications (POST)
export async function POST(request: Request) {
  const body = await request.json();
  // console.log('Incoming WhatsApp Webhook:', JSON.stringify(body, null, 2));
  
  // Return 200 to WhatsApp to acknowledge receipt
  return NextResponse.json({ status: 'ok' });
}