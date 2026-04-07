import { NextResponse } from "next/server";
import { getBrevoConfigStatus } from "@/utils/mailer";

const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "").trim();

export async function GET() {
  const config = getBrevoConfigStatus();

  if (!config.keyConfigured) {
    return NextResponse.json(
      {
        brevo: "not-ready",
        reason: "BREVO_API_KEY is missing or placeholder",
        config,
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": BREVO_API_KEY,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        {
          brevo: "error",
          status: response.status,
          statusText: response.statusText,
          body,
          config,
        },
        { status: 502 },
      );
    }

    const account = await response.json();
    return NextResponse.json({
      brevo: "ready",
      accountEmail: account?.email || null,
      plan: account?.plan || null,
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        brevo: "error",
        error: message,
        config,
      },
      { status: 500 },
    );
  }
}
